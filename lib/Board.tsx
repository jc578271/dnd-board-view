import React, {memo, useLayoutEffect} from 'react';
import List, {
  ListProps,
  defaultListProps,
  AnimatedListView,
  DragInfo,
  defaultDraggingState,
} from './List';
import {
  StyleSheet,
  StyleProp,
  ViewStyle,
  View,
  ScrollViewProps,
  LayoutChangeEvent,
  Dimensions,
  Platform,
} from 'react-native';
import {BoardExtendedState, ItemTypes, ListData} from './types';
import {Dimension, Layout} from 'base-recyclerlistview';
import BoardContextProvider from './BoardContextProvider';
import {
  LongPressGestureHandler,
  State as GestureState,
  LongPressGestureHandlerEventExtra,
  GestureHandlerGestureEventNativeEvent,
  TapGestureHandler,
  TapGestureHandlerEventExtra,
} from 'react-native-gesture-handler';
import Animated, {
  and,
  not,
  neq,
  sub,
  Value,
  cond,
  event,
  set,
  eq,
  call,
  Clock,
  or,
  clockRunning,
  add,
  onChange,
  block,
  spring,
  stopClock,
  defined,
  TransitioningView,
} from 'react-native-reanimated';
import AutoScrollNativeList, {
  scrollPositionTolerance,
} from './AutoScrollNativeList';
import {NativeListProps} from './NativeList';
import {ControlTransitionView} from './ListView';
import throttle from 'lodash/throttle';
import debounce from 'lodash/debounce';
import {usePrevious} from './hooks';

let dims = Dimensions.get('screen');
let screenWidth = dims.width;
let screenHeight = dims.height;
const [shortDimension] =
  screenWidth < screenHeight
    ? [screenWidth, screenHeight]
    : [screenHeight, screenWidth];

const draggingRotate = new Value<number>(Math.PI / 60);
const normalRotate = new Value<number>(0);

const defaultAnimationConfig = {
  damping: 20,
  mass: 0.2,
  stiffness: 100,
  overshootClamping: false,
  restSpeedThreshold: 0.2,
  restDisplacementThreshold: 0.2,
};

const defaultScrollViewProps: ScrollViewProps = {
  showsVerticalScrollIndicator: false,
  showsHorizontalScrollIndicator: false,
  decelerationRate: 'fast',
  pagingEnabled: true,
  bounces: false,
};

const defaultDragInfo: DragInfo = {
  listKey: undefined,
  index: -1,
  data: undefined,
};

export interface BoardProps
  extends Omit<
    ListProps,
    'data' | 'listKey' | 'contextProvider' | 'onListItemDragEnd'
  > {
  data: ListData[];
  listKeyExtractor: (data: any) => string;
  listContainerWidth: number;
  boardAutoScrollThreshold: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  sideSpacing: number;
  crossListTolerance: number;
  renderExtraColumn?: () => JSX.Element | JSX.Element[] | null;
  onDragEnd: (
    sourceKey: string,
    destinationKey: string,
    itemData: any,
    previousItemData: any | undefined,
    oldIndex: number,
    newIndex: number,
  ) => void;
  allowToReorder: boolean;
  onStartMoveItem: (data: any | undefined) => boolean;
  forceRollback: number;
  onHorizontalScroll?: (index: number) => void
}

type Props = BoardProps & NativeListProps;

interface BoardState {
  measureCompleted: boolean;
  data: ListData[];
  listKeyArray: string[];
  draggingState: BoardExtendedState;
  normalState: BoardExtendedState;
}

export class Board extends AutoScrollNativeList<Props, BoardState> {
  static defaultProps: Partial<Props> = {
    ...defaultListProps,
    horizontal: true,
    sideSpacing: 0,
    boardAutoScrollThreshold: 50,
    crossListTolerance: 16,
    allowToReorder: true,
    forceRollback: 0,
  };

  static getDerivedStateFromProps(props: Props, state: BoardState) {
    if (props.data !== state.data) {
      return {
        data: props.data,
        listKeyArray: props.data.map(listData =>
          props.listKeyExtractor(listData),
        ),
      };
    }
    return null;
  }

  constructor(props: Props) {
    super(props);
    this.state = {
      measureCompleted: false,
      draggingState: {
        ...defaultDraggingState,
        forceRollback: this.props.forceRollback,
      },
      normalState: {
        ...defaultDraggingState,
        forceRollback: this.props.forceRollback,
      },
      data: props.data,
      listKeyArray: props.data.map(listData =>
        props.listKeyExtractor(listData),
      ),
    };
  }

  board = React.createRef<typeof AnimatedListView>();
  listRefs = new Map<string, React.RefObject<List>>();

  scrollViewProps: ScrollViewProps = {
    ...defaultScrollViewProps,
    snapToInterval: this.props.listContainerWidth,
    contentContainerStyle: this.props.contentContainerStyle,
  };

  boardHeight = 0;
  boardWidth = 0;

  mounted = false;
  autoScrollTimeout: any = undefined;

  contextProviderMap: Map<string, BoardContextProvider> = new Map();

  //Move from list

  _tapGestureHandlerRef = React.createRef<TapGestureHandler>();
  _longPressGestureHandlerRef = React.createRef<LongPressGestureHandler>();
  _controlTransitionRef = React.createRef<TransitioningView>();

  gestureState = new Value(GestureState.UNDETERMINED);
  tapGestureState = new Value(GestureState.UNDETERMINED);

  isHovering = new Value<number>(0);
  disabled = new Value<number>(0);
  headerHeight = new Value<number>(this.props.headerHeight || 0);
  leftSpacing = new Value<number>(this.props.sideSpacing || 0);
  touchX = new Value<number>(0);
  touchY = new Value<number>(0);

  lastMoveX: number | undefined = undefined;
  lastMoveY: number | undefined = undefined;

  hoverTop = 0;
  hoverLeft = 0;
  hoverLeftNative = new Value<number>(0);
  hoverTopNative = new Value<number>(0);
  hoverTranslateX = new Value<number>(this.props.draggingTranslateX || 0);
  hoverTranslateY = new Value<number>(this.props.draggingTranslateY || 0);
  draggingItemWidth = 0;
  draggingItemHeight = 0;
  hoverClock = new Clock();
  hoverToX = new Value<number>(0);
  hoverToY = new Value<number>(0);
  hoverAnimX = add(this.touchX, this.hoverTranslateX, this.leftSpacing);
  hoverAnimY = add(this.touchY, this.hoverTranslateY, this.headerHeight);
  hoverAnimXState = {
    finished: new Value(0),
    velocity: new Value(0),
    position: new Value(0),
    time: new Value(0),
  };
  hoverAnimYState = {
    finished: new Value(0),
    velocity: new Value(0),
    position: new Value(0),
    time: new Value(0),
  };

  hoverAnimXConfig = {
    ...defaultAnimationConfig,
    toValue: this.hoverToX,
  };
  hoverAnimYConfig = {
    ...defaultAnimationConfig,
    toValue: this.hoverToY,
  };

  currentStartIndex = -1;

  hoverLayoutX = new Value<number>(0);

  isPressedIn = {
    js: false,
  };

  dragSource: DragInfo = {...defaultDragInfo};

  destinationSource: DragInfo = {...defaultDragInfo};

  releaseDragSource: DragInfo = {...defaultDragInfo};

  releaseDestinationSource: DragInfo = {...defaultDragInfo};

  draggingData: any = undefined;

  checkMoveDebounceEnabled = false;
  checkMoveDebounceTimeout: any = undefined;

  componentDidMount = () => {
    this.mounted = true;
  };

  componentWillUnmount = () => {
    this.mounted = false;
  };

  componentDidUpdate(prevProps: Props) {
    if (this.props.forceRollback !== prevProps.forceRollback) {
      this.setState(prevState => ({
        ...prevState,
        draggingState: {
          ...prevState.draggingState,
          forceRollback: this.props.forceRollback,
        },
        normalState: {
          ...prevState.normalState,
          forceRollback: this.props.forceRollback,
        },
      }));
    }
    if (this.props.headerHeight !== prevProps.headerHeight) {
      this.headerHeight.setValue(this.props.headerHeight || 0);
    }
    if (this.props.draggingTranslateX !== prevProps.draggingTranslateX) {
      this.hoverTranslateX.setValue(this.props.draggingTranslateX || 0);
    }
    if (this.props.draggingTranslateY !== prevProps.draggingTranslateY) {
      this.hoverTranslateY.setValue(this.props.draggingTranslateY || 0);
    }
  }

  animationNextTransition = () => {
    if (this._controlTransitionRef.current) {
      this._controlTransitionRef.current.animateNextTransition();
    }
  };

  _getRecycleRef = () => {
    if (!this.board.current || !this.board.current._component) return null;
    return this.board.current._component;
  };

  getDistFromLeft = () => {
    return Math.max(0, this.lastMoveX || 0);
  };

  getDistFromRight = () => {
    return Math.max(0, this.containerSize - (this.lastMoveX || 0));
  };

  isAtEdge = () => {
    const {boardAutoScrollThreshold} = this.props;
    const distFromTop = this.getDistFromLeft();
    const distFromBottom = this.getDistFromRight();
    const scrollUp = distFromTop < boardAutoScrollThreshold!;
    const scrollDown = distFromBottom < boardAutoScrollThreshold!;
    return scrollUp || scrollDown;
  };

  getScrollTargetOffset = () => {
    if (this.isAutoscrolling) return -1;
    const distFromTop = this.getDistFromLeft();
    const distFromBottom = this.getDistFromRight();
    const {boardAutoScrollThreshold, listContainerWidth} = this.props;
    const scrollUp = distFromTop < boardAutoScrollThreshold!;
    const scrollDown = distFromBottom < boardAutoScrollThreshold!;
    if (
      !(scrollUp || scrollDown) ||
      (scrollUp && this.isScrolledUp()) ||
      (scrollDown && this.isScrolledDown())
    ) {
      this.isAutoscrolling = false;
      return -1;
    }

    const index = Math.max(
      0,
      Math.floor((this.scrollOffset + 1) / this.props.listContainerWidth),
    );

    const targetOffset = scrollUp
      ? Math.max(0, (index - 1) * listContainerWidth)
      : (index + 1) * listContainerWidth;
    if (
      (targetOffset >= this.scrollOffset && scrollUp) ||
      (targetOffset <= this.scrollOffset && scrollDown)
    ) {
      return -1;
    }
    return targetOffset;
  };

  autoscroll = () => {
    const targetOffset = this.getScrollTargetOffset();
    if (targetOffset >= 0 && this.isPressedIn.js) {
      this.checkForMoveInOutListStart();
      this.autoScrollToOffset(targetOffset);
      this.nextAutoScroll();
    } else {
      this.cancelAutoScroll();
    }
  };

  nextAutoScroll = () => {
    if (!this.mounted) return;
    if (!this.isPressedIn.js) return;
    this.cancelAutoScroll();
    this.autoScrollTimeout = setTimeout(
      this.autoscroll,
      Platform.OS === 'ios' ? 600 : 750,
    );
  };

  cancelAutoScroll = () => {
    if (this.autoScrollTimeout) {
      clearTimeout(this.autoScrollTimeout);
      this.autoScrollTimeout = undefined;
    }
  };

  autoScrollToOffset = (offset: number) => {
    const ref = this._getRecycleRef();
    if (!ref) return;
    if (ref.scrollToOffset) {
      if (offset !== this.scrollOffset) {
        this.isAutoscrolling = true;
        this.startAutoScrollOffset = this.scrollOffset;
        this.targetScrollOffset = offset;
        ref.scrollToOffset(offset, offset, true);
      }
    }
  };

  updateAutoScrolling = () => {
    if (this.isAutoscrolling) {
      this.isAutoscrolling = !(
        Math.abs(this.targetScrollOffset - this.scrollOffset) <=
          scrollPositionTolerance ||
        this.isScrolledUp() ||
        this.isScrolledDown() ||
        (this.targetScrollOffset <= this.scrollOffset &&
          this.targetScrollOffset >= this.startAutoScrollOffset) ||
        (this.targetScrollOffset >= this.scrollOffset &&
          this.targetScrollOffset <= this.startAutoScrollOffset)
      );
      if (!this.isAutoscrolling) {
        this.nextAutoScroll();
      }
    }
  };

  public scrollToIndex = (index: number) => {
    const ref = this._getRecycleRef();
    if (!ref) return;
    if (ref.scrollToOffset) {
      const offset = this.props.listContainerWidth * index;
      ref.scrollToOffset(offset, offset, false);
    }
  };

  onListContentSizeChange = (w: number, h: number) => {
    this.scrollViewSize = w;
  };

  handleLayout = (e: LayoutChangeEvent) => {
    this.containerSize = e.nativeEvent.layout.width;
  };

  onItemPressedIn = () => {
    this.isPressedIn.js = true;
  };

  onSectionPressedIn = () => {
    this.isPressedIn.js = false;
  };

  hasPressedIn = () => {
    return this.isPressedIn.js;
  };

  onResetPressedIn = () => {
    this.isPressedIn.js = false;
  };

  onBeforeDrag = (x: number, y: number, rowLayout?: Layout | undefined) => {
    const activeIndex = this.getCurrentActiveIndex();
    const hoverLayoutX =
      (activeIndex > -1
        ? Math.max(0, activeIndex)
        : Math.max(0, this.currentStartIndex)) * this.props.listContainerWidth;
    this.hoverLayoutX.setValue(hoverLayoutX); //Keep update when drag cross list

    //Just update util dragging
    if (
      typeof this.state.draggingState.draggingKey === 'undefined' &&
      typeof rowLayout !== 'undefined'
    ) {
      const hoverTop = rowLayout.y - y;
      const hoverLeft =
        rowLayout.x -
        (x -
          Math.max(0, this.currentStartIndex) * this.props.listContainerWidth +
          this.scrollOffset);
      this.hoverTop = hoverTop;
      this.hoverTopNative.setValue(hoverTop);
      this.hoverLeft = hoverLeft;
      this.hoverLeftNative.setValue(hoverLeft);
      this.draggingItemWidth = rowLayout.width;
      this.draggingItemHeight = rowLayout.height;
    }
  };

  onHasMoved = (
    listKey: string,
    move: 0 | 1,
    draggingKey: string = '',
    dragInfo?: DragInfo | undefined,
  ) => {
    if (move === 1) {
      if (draggingKey !== this.state.draggingState.draggingKey) {
        if (dragInfo) {
          this.dragSource = {...dragInfo};
        }
        this.isHovering.setValue(1);
        this.setState(prevState => ({
          ...prevState,
          draggingState: {
            activeListKey: listKey,
            draggingKey,
            forceRollback: prevState.draggingState.forceRollback,
          },
        }));
      }
    } else {
      if (!!this.state.draggingState.draggingKey) {
        if (this.state.draggingState.activeListKey === listKey) {
          this.onDrop();
        }
      }
    }
  };

  onDrop = () => {
    this.isHovering.setValue(0);
    this.setState(
      prevState => ({
        ...prevState,
        draggingState: prevState.normalState,
      }),
      () => {
        requestAnimationFrame(() => {
          this.disabled.setValue(0);
        });
      },
    );
  };

  onReset = () => {
    this.cancelAutoScroll();
    this.onResetPressedIn();
    this.lastMoveX = undefined;
    this.lastMoveY = undefined;
    this.releaseDragSource = {...this.dragSource};
    this.releaseDestinationSource = {...this.destinationSource};
    this.dragSource = {...defaultDragInfo};
    this.destinationSource = {...defaultDragInfo};
    this.draggingData = undefined;
    this.currentStartIndex = -1;
  };

  onListItemDragEnd = (
    listKey: string,
    itemData: any,
    previousItemData: any | undefined,
    fromIndex: number,
    toIndex: number,
  ) => {
    const fromKey = this.releaseDragSource.listKey || listKey;
    if (fromKey !== listKey || this.releaseDragSource.index !== toIndex) {
      this.props.onDragEnd(
        this.releaseDragSource.listKey || listKey,
        listKey,
        typeof itemData !== 'undefined'
          ? itemData
          : this.releaseDragSource.data,
        previousItemData,
        this.releaseDragSource.index,
        toIndex,
      );
    }
  };

  start = ([x, y]: ReadonlyArray<number>) => {
    this.lastMoveX = x;
    this.lastMoveY = y;
    if (this.state.draggingState.draggingKey) return;
    const index = this.xToIndex(x);
    if (index < 0) return;
    if (index >= this.props.data.length) return;

    const key = this.keyExtractor(index);
    const ref = this.listRefs.get(key);
    if (ref && ref.current) {
      this.currentStartIndex = index;
      ref.current.start([x, y]);
    }
  };

  onDragActive = ([x, y]: ReadonlyArray<number>) => {
    if (!this.hasPressedIn()) return;
    if (typeof this.state.draggingState.draggingKey !== 'undefined') return;
    const index = this.xToIndex(x);
    if (index < 0) return;
    if (index >= this.props.data.length) return;

    const key = this.keyExtractor(index);
    const ref = this.listRefs.get(key);
    if (ref && ref.current) {
      const data = ref.current.getCurrentItem([x, y]);
      if (typeof data === 'undefined') {
        this.isPressedIn.js = false;
        return;
      }
      const allowToMove = this.props.onStartMoveItem(data);
      if (!allowToMove) {
        this.isPressedIn.js = false;
        return;
      }
      this.setState(prevState => ({
        ...prevState,
        draggingState: {
          ...prevState.draggingState,
          activeListKey: key,
        },
      }));
    }
  };

  xToIndex = (x: number) => {
    return Math.max(
      0,
      Math.floor(
        (x + this.scrollOffset - this.props.sideSpacing) /
          this.props.listContainerWidth,
      ),
    );
  };

  move = ([x, y]: ReadonlyArray<number>) => {
    if (!this.isPressedIn.js) return;
    this.lastMoveX = x;
    this.lastMoveY = y;
    this.checkForMoveInOutListStart();
    const distFromTop = this.getDistFromLeft();
    const distFromBottom = this.getDistFromRight();
    const {boardAutoScrollThreshold} = this.props;
    const scrollUp = distFromTop < boardAutoScrollThreshold!;
    const scrollDown = distFromBottom < boardAutoScrollThreshold!;
    if (!scrollUp && !scrollDown) {
      this.cancelAutoScroll();
      this.isAutoscrolling = false;
    } else {
      if (!this.autoScrollTimeout) {
        this.autoscroll();
      }
    }
  };

  getCurrentActiveIndex = () => {
    const {activeListKey} = this.state.draggingState;
    return activeListKey ? this.state.listKeyArray.indexOf(activeListKey) : -1;
  };

  checkForMoveOutList = () => {
    const {activeListKey, draggingKey} = this.state.draggingState;
    if (activeListKey && typeof this.lastMoveX === 'number' && draggingKey) {
      const {crossListTolerance} = this.props;
      const index = this.xToIndex(this.lastMoveX);
      const lowerIndex = this.xToIndex(this.lastMoveX - crossListTolerance);
      const upperIndex = this.xToIndex(this.lastMoveX + crossListTolerance);
      const activeIndex = this.state.listKeyArray.indexOf(activeListKey);

      if (index !== activeIndex) {
        if (
          (index === lowerIndex && index === upperIndex) ||
          Math.abs(index - activeIndex) >= 2
        ) {
          const listRef = this.listRefs.get(activeListKey);
          if (listRef && listRef.current) {
            const dragInfo = listRef.current.moveItemOut(draggingKey);
            if (dragInfo) {
              this.draggingData =
                typeof dragInfo.data === 'object'
                  ? {...dragInfo.data}
                  : dragInfo.data;
              this.destinationSource = {
                listKey: dragInfo.listKey,
                data:
                  typeof dragInfo.data === 'object'
                    ? {...dragInfo.data}
                    : dragInfo.data,
                index: dragInfo.index,
              };
              this.setState(prevState => ({
                ...prevState,
                draggingState: {
                  ...prevState.draggingState,
                  activeListKey: undefined,
                },
              }));
            }
          }
        }
      }
    }
  };

  checkForMoveInList = () => {
    if (
      this.mounted &&
      typeof this.draggingData !== 'undefined' &&
      typeof this.state.draggingState.activeListKey === 'undefined' &&
      this.lastMoveX &&
      this.state.draggingState.draggingKey
    ) {
      if (this.isAtEdge()) return;
      const index = this.xToIndex(this.lastMoveX);
      const listData = this.props.data[index];
      if (listData) {
        const listKey = this.props.listKeyExtractor(listData);
        if (listKey) {
          const listRef = this.listRefs.get(listKey);
          if (listRef && listRef.current) {
            this.setState(prevState => ({
              ...prevState,
              draggingState: {
                ...prevState.draggingState,
                activeListKey: listKey,
              },
            }));
            const data =
              typeof this.draggingData === 'object'
                ? {...this.draggingData}
                : this.draggingData;
            this.draggingData = undefined;
            const destinationIndex = listRef.current.moveItemIn(
              data,
              this.lastMoveX,
              this.lastMoveY || 0,
              this.draggingItemHeight,
            );
            this.destinationSource = {
              listKey: listKey,
              data,
              index: Math.max(0, destinationIndex),
            };
          }
        }
      }
    }
  };

  clearCheckMoveDebounceTimeout = () => {
    if (this.checkMoveDebounceTimeout) {
      clearTimeout(this.checkMoveDebounceTimeout);
      this.checkMoveDebounceTimeout = undefined;
    }
  };

  startCheckMoveDebounceTimeout = () => {
    this.clearCheckMoveDebounceTimeout();
    this.checkMoveDebounceTimeout = setTimeout(() => {
      if (!this.mounted) return;
      this.checkMoveDebounceEnabled = false;
    }, 300);
  };

  checkForMoveInOutList = () => {
    this.checkForMoveOutList();
    this.checkForMoveInList();
    this.startCheckMoveDebounceTimeout();
  };

  checkForMoveInOutListDebounce = debounce(this.checkForMoveInOutList, 250);

  checkForMoveInOutListStart = () => {
    if (this.checkMoveDebounceEnabled) {
      this.checkForMoveInOutListDebounce();
    } else {
      this.checkMoveDebounceEnabled = true;
      this.checkForMoveInOutList();
    }
  };

  onBackRelease = ([isHovering]: ReadonlyArray<number>) => {
    if (
      typeof this.draggingData !== 'undefined' &&
      this.state.draggingState.draggingKey
    ) {
      const destinationListKey = this.dragSource.listKey;
      const destinationIndex = this.dragSource.index;
      if (destinationListKey && destinationIndex > -1) {
        const index = this.props.data.findIndex(listData => {
          return this.props.listKeyExtractor(listData) === destinationListKey;
        });
        if (index > -1) {
          this.scrollToIndex(index);
        }
        setTimeout(() => {
          const destinationListRef = this.listRefs.get(destinationListKey);
          const item =
            typeof this.draggingData === 'object'
              ? {...this.draggingData}
              : this.draggingData;
          if (destinationListRef && destinationListRef.current) {
            this.onReset();
            destinationListRef.current.moveItemBack(item, destinationIndex);
          } else {
            this.onReset();
          }
          this.onDrop();
        }, 0);
      }
    } else {
      this.onReset();
    }
  };

  checkAutoscroll = cond(
    and(this.isHovering, eq(this.gestureState, GestureState.ACTIVE)),
    [call([this.touchX, this.touchY], this.move)],
  );

  onTapStateChange = event([
    {
      nativeEvent: ({
        state,
        y,
        x,
      }: GestureHandlerGestureEventNativeEvent & TapGestureHandlerEventExtra) =>
        cond(and(neq(state, this.tapGestureState), not(this.disabled)), [
          set(this.tapGestureState, state),
          cond(eq(this.tapGestureState, GestureState.BEGAN), [
            set(this.touchX, x),
            set(this.touchY, sub(y, this.headerHeight, this.hoverTranslateY)),
          ]),
          cond(
            eq(this.tapGestureState, GestureState.BEGAN),
            call([this.touchX, this.touchY], this.start),
          ),
        ]),
    },
  ]);

  onLongPressStateChange = event([
    {
      nativeEvent: ({
        state,
        x,
        y,
      }: GestureHandlerGestureEventNativeEvent &
        LongPressGestureHandlerEventExtra) =>
        block([
          cond(and(neq(state, this.gestureState), not(this.disabled)), [
            cond(
              and(
                this.isHovering,
                or(
                  eq(state, GestureState.END),
                  eq(state, GestureState.CANCELLED),
                  eq(state, GestureState.FAILED),
                ),
              ),
              call([this.isHovering], this.onBackRelease),
            ),
            set(this.gestureState, state),
            set(this.touchX, x),
            set(this.touchY, sub(y, this.headerHeight, this.hoverTranslateY)),
            cond(
              eq(this.gestureState, GestureState.ACTIVE),
              call([this.touchX, this.touchY], this.onDragActive),
            ),
          ]),
        ]),
    },
  ]);

  onLongPressGestureEvent = event([
    {
      nativeEvent: ({x, y}: LongPressGestureHandlerEventExtra) =>
        cond(
          and(
            this.isHovering,
            eq(this.gestureState, GestureState.ACTIVE),
            not(this.disabled),
          ),
          [
            set(this.touchX, x),
            set(this.touchY, sub(y, this.headerHeight, this.hoverTranslateY)),
          ],
        ),
    },
  ]);

  //End move from list

  getContextProvider = (key: string) => {
    let contextProvider = this.contextProviderMap.get(key);
    if (typeof contextProvider === 'undefined') {
      contextProvider = new BoardContextProvider(key);
      this.contextProviderMap.set(key, contextProvider);
    }
    return contextProvider;
  };

  getDragInfo = (listKey: string): [boolean, string | undefined] => {
    return [
      this.dragSource.listKey === listKey,
      this.state.draggingState.draggingKey,
    ];
  };

  getDraggingKey = () => this.state.draggingState.draggingKey;
  getLastMoveY = () => this.lastMoveY;

  renderList = (
    type: React.ReactText,
    listData: any,
    index: number,
    extendedState: BoardExtendedState,
  ) => {
    const {
      data,
      listKeyExtractor,
      listContainerWidth,
      contentContainerStyle,
      horizontal,
      sideSpacing,
      crossListTolerance,
      boardAutoScrollThreshold,
      onDragEnd,
      forceRollback,
      ...listProps
    } = this.props;
    const listKey = listKeyExtractor(listData);
    const contextProvider = this.getContextProvider(listKey);
    let ref = this.listRefs.get(listKey);
    if (!ref) {
      ref = React.createRef();
      this.listRefs.set(listKey, ref);
    }
    return (
      <List
        ref={ref}
        listKey={listKey}
        data={listData.data}
        listData={listData}
        contextProvider={contextProvider}
        contextProviderMap={this.contextProviderMap}
        onItemPressedIn={this.onItemPressedIn}
        onSectionPressedIn={this.onSectionPressedIn}
        hasPressedIn={this.hasPressedIn}
        gestureState={this.gestureState}
        touchX={this.touchX}
        touchY={this.touchY}
        disabled={this.disabled}
        isHovering={this.isHovering}
        onHasMoved={this.onHasMoved}
        onBeforeDrag={this.onBeforeDrag}
        hoverToY={this.hoverToY}
        hoverClock={this.hoverClock}
        onGestureRelease={this.onGestureRelease}
        hoverTopNative={this.hoverTopNative}
        onListItemDragEnd={this.onListItemDragEnd}
        animationNextTransition={this.animationNextTransition}
        getDragInfo={this.getDragInfo}
        getDraggingKey={this.getDraggingKey}
        getLastMoveY={this.getLastMoveY}
        draggingState={
          extendedState.activeListKey === listKey
            ? extendedState
            : this.state.normalState
        }
        {...listProps}
      />
    );
  };

  getLayoutTypeForIndex = (): ItemTypes => ItemTypes.Item;

  setLayoutForType = (type: React.ReactText, dim: Dimension, index: number) => {
    dim.height = this.boardHeight;
    const data = this.props.data[index];
    if (typeof data === 'undefined') {
      dim.width = 0;
    } else {
      dim.width = this.props.listContainerWidth;
    }
  };

  setLandscapeLayoutForType = (
    type: React.ReactText,
    dim: Dimension,
    index: number,
  ) => {
    dim.height = this.boardWidth;
    const data = this.props.data[index];
    if (typeof data === 'undefined') {
      dim.width = 0;
    } else {
      dim.width = this.props.listContainerWidth;
    }
  };

  keyExtractor = (index: number) => {
    const data = this.props.data[index];
    return this.props.listKeyExtractor(data);
  };

  onLayout = (e: LayoutChangeEvent) => {
    this.boardHeight = Math.max(
      e.nativeEvent.layout.height,
      e.nativeEvent.layout.width,
    );
    this.boardWidth = Math.min(
      e.nativeEvent.layout.height,
      e.nativeEvent.layout.width,
    );
    if (!this.state.measureCompleted) {
      this.setState(prevState => ({
        ...prevState,
        measureCompleted: true,
      }));
    }
  };

  updateHoverToX = set(
    this.hoverToX,
    sub(
      add(this.hoverLayoutX, this.hoverTranslateX, this.leftSpacing),
      this.hoverLeftNative,
      this.scrollOffsetNative,
    ),
  );

  resetHoverSpring = block([
    set(this.hoverAnimXState.time, 0),
    set(this.hoverAnimXState.position, this.hoverAnimXConfig.toValue),
    set(this.hoverAnimXState.finished, 0),
    set(this.hoverAnimXState.velocity, 0),
    set(this.hoverAnimYState.time, 0),
    set(this.hoverAnimYState.position, this.hoverAnimYConfig.toValue),
    set(this.hoverAnimYState.finished, 0),
    set(this.hoverAnimYState.velocity, 0),
  ]);

  onGestureRelease = [
    this.updateHoverToX,
    set(this.hoverAnimXState.position, this.hoverAnimX),
    set(this.hoverAnimYState.position, this.hoverAnimY),
  ];

  //TODO: lose dragging item when gestureState still active
  // It should be by List onHasMove

  hoverComponentTranslateX = cond(
    or(clockRunning(this.hoverClock), this.disabled),
    this.hoverAnimXState.position,
    this.hoverAnimX,
  );

  hoverComponentTranslateY = cond(
    or(clockRunning(this.hoverClock), this.disabled),
    this.hoverAnimYState.position,
    this.hoverAnimY,
  );

  hoverComponentOpacity = cond(
    or(
      and(this.isHovering, neq(this.gestureState, GestureState.CANCELLED)),
      clockRunning(this.hoverClock),
    ),
    0.7,
    0,
  );

  rotate = cond(
    or(
      and(this.isHovering, neq(this.gestureState, GestureState.ACTIVE)),
      clockRunning(this.hoverClock),
    ),
    normalRotate,
    draggingRotate,
  );

  render() {
    const scrollEnabled = this.state.draggingState.draggingKey === undefined;
    return (
      <View style={styles.container} onLayout={this.onLayout}>
        {this.state.measureCompleted && (
          <TapGestureHandler
            ref={this._tapGestureHandlerRef}
            simultaneousHandlers={this._longPressGestureHandlerRef}
            onHandlerStateChange={this.onTapStateChange}>
            <Animated.View style={styles.container}>
              <LongPressGestureHandler
                simultaneousHandlers={this._tapGestureHandlerRef}
                minDurationMs={this.props.delayLongPress}
                maxDist={Number.MAX_SAFE_INTEGER}
                shouldCancelWhenOutside={false}
                ref={this._longPressGestureHandlerRef}
                onGestureEvent={this.onLongPressGestureEvent}
                onHandlerStateChange={this.onLongPressStateChange}>
                <Animated.View style={styles.container}>
                  <ControlTransitionView ref={this._controlTransitionRef}>
                    <TransitionBoardViewController
                      animationNextTransition={this.animationNextTransition}
                      dataLength={this.state.data.length}
                    />
                    <AnimatedListView
                      ref={this.board}
                      data={this.props.data}
                      rowRenderer={this.renderList}
                      keyExtractor={this.keyExtractor}
                      getLayoutTypeForIndex={this.getLayoutTypeForIndex}
                      setLayoutForType={this.setLayoutForType}
                      setLandscapeLayoutForType={this.setLandscapeLayoutForType}
                      isHorizontal={true}
                      scrollViewProps={this.scrollViewProps}
                      renderAheadOffset={shortDimension}
                      onContentSizeChange={this.onListContentSizeChange}
                      onLayout={this.handleLayout}
                      externalScrollView={this.scrollView}
                      scrollEnabled={scrollEnabled}
                      extendedState={this.state.draggingState}
                      renderFooter={this.props.renderExtraColumn}
                      onScroll={(rawEvent: any, offsetX: number, offsetY: number) => {
                        const index = Math.floor((offsetX + this.props.listContainerWidth/2)/(this.props.listContainerWidth))
                        this.props.onHorizontalScroll?.(index > this.props.data.length ? this.props.data.length : index )
                      }}
                      scrollThrottle={this.props.listContainerWidth}
                    />
                  </ControlTransitionView>
                  <Animated.Code>
                    {() => onChange(this.touchX, this.checkAutoscroll)}
                  </Animated.Code>
                  <Animated.Code>
                    {() =>
                      cond(clockRunning(this.hoverClock), [
                        spring(
                          this.hoverClock,
                          this.hoverAnimXState,
                          this.hoverAnimXConfig,
                        ),
                        spring(
                          this.hoverClock,
                          this.hoverAnimYState,
                          this.hoverAnimYConfig,
                        ),
                        cond(
                          and(
                            eq(this.hoverAnimYState.finished, 1),
                            eq(this.hoverAnimXState.finished, 1),
                          ),
                          [stopClock(this.hoverClock), this.resetHoverSpring],
                        ),
                      ])
                    }
                  </Animated.Code>

                  <Animated.Code>
                    {() =>
                      block([
                        onChange(this.hoverLeftNative, this.updateHoverToX),
                        onChange(this.hoverTranslateX, this.updateHoverToX),
                        onChange(this.leftSpacing, this.updateHoverToX),
                        onChange(this.hoverLayoutX, this.updateHoverToX),
                      ])
                    }
                  </Animated.Code>
                  {Platform.OS === 'ios' ? (
                    <Animated.Code>
                      {() =>
                        block([
                          onChange(
                            this.tapGestureState,
                            cond(
                              neq(this.tapGestureState, GestureState.BEGAN),
                              cond(
                                not(this.isHovering),
                                call([], this.onResetPressedIn),
                              ),
                            ),
                          ),
                        ])
                      }
                    </Animated.Code>
                  ) : (
                    <Animated.Code>
                      {() =>
                        block([
                          onChange(
                            this.gestureState,
                            cond(
                              neq(this.gestureState, GestureState.ACTIVE),
                              cond(
                                not(this.isHovering),
                                call([], this.onResetPressedIn),
                              ),
                            ),
                          ),
                        ])
                      }
                    </Animated.Code>
                  )}
                </Animated.View>
              </LongPressGestureHandler>
            </Animated.View>
          </TapGestureHandler>
        )}
        {typeof this.state.draggingState.draggingKey !== 'undefined' ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.drag,
              {
                width: this.draggingItemWidth,
                height: this.draggingItemHeight,
                top: this.hoverTop,
                left: this.hoverLeft,
                opacity: this.hoverComponentOpacity,
                transform: [
                  {
                    translateY: this.hoverComponentTranslateY,
                  },
                  {
                    translateX: this.hoverComponentTranslateX,
                  },
                  {
                    rotate: this.rotate,
                  },
                ],
              },
            ]}>
            {this.props.draggingItemRender(
              this.state.draggingState.draggingKey,
            )}
          </Animated.View>
        ) : null}
      </View>
    );
  }
}

interface TransitionBoardViewControllerProps {
  animationNextTransition: () => void;
  dataLength: any;
}

const TransitionBoardViewController = memo(
  ({
    animationNextTransition,
    dataLength,
  }: TransitionBoardViewControllerProps) => {
    const previousDataLength = usePrevious(dataLength);
    useLayoutEffect(() => {
      if (dataLength !== previousDataLength) {
        animationNextTransition();
      }
    }, [dataLength]);

    return null;
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  drag: {
    position: 'absolute',
  },
});
