import React from 'react';
import {ListView, TransitionViewController} from './ListView';
import {Dimension, Layout} from 'base-recyclerlistview';
import {Constants} from 'base-recyclerlistview/dist/reactnative/core/constants/Constants';
import {State as GestureState} from 'react-native-gesture-handler';
import Animated, {
  and,
  sub,
  add,
  defined,
  clockRunning,
  stopClock,
  startClock,
  block,
  onChange,
} from 'react-native-reanimated';
import {LayoutChangeEvent, StyleSheet, Platform} from 'react-native';
import {RowItem} from './RowItem';
import {
  immutableMove,
  relocateSections,
  sectionDataFlatten,
  insertItem,
} from './utils';
import {
  SectionData,
  SectionIndices,
  ItemTypes,
  TempLayout,
  FlattenData,
  BoardExtendedState,
  ListData,
} from './types';
import AutoScrollNativeList from './AutoScrollNativeList';
import BoardContextProvider from './BoardContextProvider';
import {NativeListProps} from './NativeList';

const {Value, call, cond, or, eq, set} = Animated;

export const AnimatedListView = Animated.createAnimatedComponent(ListView);

export interface DragInfo {
  listKey: string | undefined;
  data: any | undefined;
  index: number;
}
export interface CurrentActiveList {
  key: string | undefined;
  index: number;
}
interface BoardListProps {
  onItemPressedIn: () => void;
  onSectionPressedIn: () => void;
  hasPressedIn: () => boolean;
  onHasMoved: (
    listKey: string,
    move: 0 | 1,
    draggingKey?: string | undefined,
    dragInfo?: DragInfo | undefined,
  ) => void;
  isHovering: Animated.Value<number>;
  gestureState: Animated.Value<GestureState>;
  touchX: Animated.Value<number>;
  touchY: Animated.Value<number>;
  disabled: Animated.Value<number>;
  onBeforeDrag: (x: number, y: number, rowLayout?: Layout | undefined) => void;
  hoverToY: Animated.Value<number>;
  hoverClock: Animated.Clock;
  onGestureRelease: Animated.Node<number>[];
  hoverTopNative: Animated.Node<number>;
  animationNextTransition: () => void;
  draggingState: BoardExtendedState;
  getDragInfo: (listKey: string) => [boolean, string | undefined];
  getDraggingKey: () => string | undefined;
  getLastMoveY: () => number | undefined;
  listData: ListData;
}

export interface ListProps {
  data: SectionData[];
  contextProvider: BoardContextProvider;
  contextProviderMap: Map<string, BoardContextProvider>;
  listKey: string;
  listItemWidth: number;
  delayLongPress: number;
  listWrapper: React.ComponentType<any>;
  listContentWrapper: React.ComponentType<any>;
  itemKeyExtractor: (data: any) => string;
  sectionKeyExtractor: (data: any) => string;
  itemRenderer: (
    listKey: string,
    data: any,
    index: number,
    onPressIn: () => void,
    extendedState: BoardExtendedState,
  ) => JSX.Element | JSX.Element[] | null;
  sectionRenderer: (
    listKey: string,
    data: any,
    index: number,
    onPressIn: () => void,
    extendedState: BoardExtendedState,
  ) => JSX.Element | JSX.Element[] | null;
  draggingItemRender: (itemKey: string) => JSX.Element | JSX.Element[] | null;
  getItemHeight: (data: any, index: number) => number;
  getSectionHeight?: (data: any, index: number) => number;
  renderHeader?: () => JSX.Element | JSX.Element[] | null;
  renderFooter?: () => JSX.Element | JSX.Element[] | null;
  listAutoScrollThreshold: number;
  listAutoScrollSpeed: number;
  draggingTranslateX?: number;
  draggingTranslateY?: number;
  headerHeight?: number;
  onListItemDragEnd: (
    listKey: string,
    itemData: any,
    previousItemData: any | undefined,
    fromIndex: number,
    toIndex: number,
  ) => void;
  canReorderItem: (data: any) => boolean;
}

export const defaultListProps: Partial<ListProps> = {
  draggingTranslateX: 0,
  draggingTranslateY: 0,
  headerHeight: 0,
  listAutoScrollThreshold: 50,
  listAutoScrollSpeed: Platform.OS === 'ios' ? 20 : 20, // Android scroll speed seems much faster than ios
};

export const defaultDraggingState: BoardExtendedState = {
  activeListKey: undefined,
  draggingKey: undefined,
  forceRollback: 0,
};

type Props = ListProps & BoardListProps & NativeListProps;
interface State extends FlattenData {
  initialOffset: number | undefined;
}
class List extends AutoScrollNativeList<Props, State> {
  static defaultProps = defaultListProps;
  list = React.createRef<typeof AnimatedListView>();
  _firstModifiedIndex: number | undefined = undefined;
  _visibleIndices: number[] = [];
  _itemWidth: number = 0;

  //From board;
  isHovering = this.props.isHovering;
  gestureState = this.props.gestureState;
  touchX = this.props.touchX;
  touchY = this.props.touchY;
  disabled = this.props.disabled;
  startedFromBoard = new Value<number>(0);

  containerTopOffset = 0;
  currIdx = -1;

  headerHeight = new Value<number>(this.props.headerHeight || 0);
  hoverTranslateY = new Value<number>(this.props.draggingTranslateY || 0);
  activeCellSize = 0; //TODO: remove

  tempData: any[];
  tempSectionIndices: SectionIndices;
  cellData: Map<string, Animated.Value<number>> = new Map();
  tempLayoutMap: Map<string, TempLayout> = new Map();
  tempFrom: number | undefined = undefined;
  tempTo: number | undefined = undefined;

  hoverLayoutOffset = new Value<number>(0);
  hoverTopNative = this.props.hoverTopNative;
  hoverTo = this.props.hoverToY;
  hoverClock = this.props.hoverClock;
  moveBlocked = false;

  constructor(props: Props) {
    super(props);
    this.state = {
      ...this._dataFlatten(this.props.data),
      initialOffset: undefined,
    };
    this.tempData = this.state.data;
    this.tempSectionIndices = this.state.sectionIndices;
    this._itemWidth = this.props.listItemWidth;
  }

  _dataFlatten = (data: SectionData[]): State => {
    return {
      ...this.state,
      ...sectionDataFlatten(data),
    };
  };

  saveScrollOffset = (key: string) => {
    const contextProvider = this.props.contextProviderMap.get(key);
    if (contextProvider) {
      const uniqueKey = contextProvider.getUniqueKey();
      if (uniqueKey) {
        contextProvider.save(
          uniqueKey + Constants.CONTEXT_PROVIDER_OFFSET_KEY_SUFFIX,
          this.scrollOffset,
        );
      }
    }
  };

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (this.props.headerHeight !== prevProps.headerHeight) {
      this.headerHeight.setValue(this.props.headerHeight || 0);
    }
    if (this.props.draggingTranslateY !== prevProps.draggingTranslateY) {
      this.hoverTranslateY.setValue(this.props.draggingTranslateY || 0);
    }
    if (
      this.props.draggingState.activeListKey === this.props.listKey &&
      prevProps.draggingState.activeListKey !== this.props.listKey
    ) {
      this.startFromBoard();
    } else if (
      this.props.draggingState.activeListKey !== this.props.listKey &&
      prevProps.draggingState.activeListKey === this.props.listKey
    ) {
      this.stopFromBoard();
    }
    let focusOffset = 0;
    const needUpdateOffset = this.props.listKey !== prevProps.listKey;
    if (needUpdateOffset) {
      const uniqueKey = this.props.contextProvider.getUniqueKey();
      if (uniqueKey) {
        const offset = this.props.contextProvider.get(
          uniqueKey + Constants.CONTEXT_PROVIDER_OFFSET_KEY_SUFFIX,
        );
        if (typeof offset === 'number' && offset > 0) {
          this.props.contextProvider.remove(
            uniqueKey + Constants.CONTEXT_PROVIDER_OFFSET_KEY_SUFFIX,
          );
          focusOffset = offset;
        }
      }
    }
    if (needUpdateOffset) {
      this.saveScrollOffset(prevProps.listKey);
    }

    if (
      this.props.data !== prevProps.data ||
      this.props.draggingState.forceRollback !==
        prevProps.draggingState.forceRollback
    ) {
      //TODO: clear local var or need to do something
      //TODO: what if dragging
      const [isDragSource, draggingKey] = this.props.getDragInfo(
        this.props.listKey,
      );
      const flattenData = this._dataFlatten(this.props.data);

      let matchIndex = -1;
      const data =
        isDragSource && typeof draggingKey !== 'undefined'
          ? flattenData.data.filter((item, index) => {
              const match =
                typeof flattenData.sectionIndices[index] === 'undefined' &&
                this.props.itemKeyExtractor(item) === draggingKey;
              if (match) {
                matchIndex = index;
              }
              return !match;
            })
          : flattenData.data;
      const sectionIndices =
        matchIndex > -1
          ? relocateSections(
              flattenData.sectionIndices,
              matchIndex,
              flattenData.data.length,
            )
          : flattenData.sectionIndices;

      const filteredFlattenData =
        isDragSource && typeof draggingKey !== 'undefined'
          ? {
              ...flattenData,
              data,
              sectionIndices,
            }
          : flattenData;
      if (needUpdateOffset) {
        this.setState(
          {
            ...this._dataFlatten([]),
          },
          () => {
            this.setState(
              {
                ...this.state,
                ...filteredFlattenData,
                initialOffset: focusOffset,
              },
              () => {
                this.tempData = this.state.data;
                this.tempSectionIndices = this.state.sectionIndices;
                this.scrollToOffset(focusOffset);
                this.scrollOffset = focusOffset;
                this.resetHoverState();
              },
            );
          },
        );
      } else {
        this.setState(
          {
            ...filteredFlattenData,
          },
          () => {
            this.tempData = this.state.data;
            this.tempSectionIndices = this.state.sectionIndices;
          },
        );
      }
    }
  }

  resetHoverState = () => {
    this.cellData.clear();
    this.tempLayoutMap.clear();
    this.reset();
  };

  reset = () => {
    this.tempFrom = undefined;
    this.currIdx = -1;
    this.activeCellSize = 0;
  };

  getPreviousItemIndex = (index: number): number => {
    if (index <= 0) return -1;
    if (this._tempIsSection(index - 1)) {
    }
    return this._tempIsSection(index - 1)
      ? this.getPreviousItemIndex(index - 1)
      : index - 1;
  };

  onRelease = ([isHovering]: ReadonlyArray<number>) => {
    if (!isHovering) return;
    if (this.props.listKey !== this.props.draggingState.activeListKey) return;
    let firstModifiedIndex: number | undefined = undefined;
    const from = this.tempFrom;
    const to = this.tempTo;
    if (typeof this.tempFrom === 'number' && typeof this.tempTo === 'number') {
      firstModifiedIndex = Math.max(0, Math.min(this.tempFrom, this.tempTo));
    }
    this.resetHoverState();
    this.tempTo = undefined;
    setTimeout(() => {
      if (typeof to === 'number') {
        this.props.onListItemDragEnd(
          this.props.listKey,
          this.tempData[to],
          this.tempData[this.getPreviousItemIndex(to)],
          typeof from === 'number' ? from : -1,
          to,
        );
      }
      if (this.tempData !== this.state.data) {
        this._firstModifiedIndex = firstModifiedIndex;
        this.setState(
          {
            data: this.tempData,
            sectionIndices: this.tempSectionIndices,
          },
          () => {
            this._firstModifiedIndex = undefined;
            this.startedFromBoard.setValue(0);
            this.props.onHasMoved(this.props.listKey, 0);
          },
        );
      } else {
        this.startedFromBoard.setValue(0);
        this.props.onHasMoved(this.props.listKey, 0); //Hide dragging
      }
    }, 0);
  };

  updateHoverToY = set(
    this.hoverTo,
    sub(
      add(this.hoverLayoutOffset, this.hoverTranslateY, this.headerHeight),
      this.hoverTopNative,
      this.scrollOffsetNative,
    ),
  );

  checkUpdateHoverToY = cond(
    and(this.isHovering, this.startedFromBoard),
    this.updateHoverToY,
  );

  onGestureRelease = block([
    cond(
      this.isHovering,
      [
        cond(this.startedFromBoard, [
          set(this.disabled, 1),
          cond(defined(this.hoverClock), [
            cond(clockRunning(this.hoverClock), stopClock(this.hoverClock)),
            this.updateHoverToY,
            this.props.onGestureRelease,
            startClock(this.hoverClock),
          ]),
        ]),
        call([this.isHovering], this.onRelease),
      ],
      call([this.isHovering], this.resetHoverState),
    ),
  ]);

  public startFromBoard = () => {
    this.startedFromBoard.setValue(1);
    this.autoScrollEnabled = true;
  };

  public moveItemOut = (draggingKey: string): DragInfo | undefined => {
    const dataLength = this.tempData.length;
    let draggingItem: any = undefined;
    let draggingIndex = -1;
    const newTempData = this.tempData.filter((item, index) => {
      const match =
        this.tempKeyExtractor(index) === draggingKey &&
        !this._tempIsSection(index);
      if (match) {
        draggingIndex = index;
        draggingItem = typeof item === 'object' ? {...item} : item;
      }
      return !match;
    });

    if (draggingIndex >= 0) {
      this.autoScrollEnabled = false;
      this.startedFromBoard.setValue(0);
      this.resetHoverState();
      //TODO: maybe need delay setState
      this.setState(
        {
          data: newTempData,
          sectionIndices:
            draggingIndex >= 0
              ? relocateSections(
                  this.tempSectionIndices,
                  draggingIndex,
                  dataLength,
                )
              : this.tempSectionIndices,
        },
        () => {
          this.tempData = this.state.data;
          this.tempSectionIndices = this.state.sectionIndices;
        },
      );
      return {
        listKey: this.props.listKey,
        data: draggingItem,
        index: draggingIndex,
      };
    }
    return undefined;
  };

  hasPressedIn = () => {
    if (this.moveBlocked) return false;
    return this.props.hasPressedIn();
  };

  getTempDataWithoutKey = (draggingKey: string) => {
    const withOutItemData = this.tempData.filter((_, index) => {
      const match =
        this.tempKeyExtractor(index) === draggingKey &&
        !this._tempIsSection(index);
      return !match;
    });
    return withOutItemData;
  };

  public moveItemIn = (
    item: any,
    x: number,
    y: number,
    activeCellSize: number,
  ) => {
    this.moveBlocked = true;
    this.reset();
    const index = this.yToIndex(y);
    const draggingKey = this.props.itemKeyExtractor(item);
    const withOutItemData = this.getTempDataWithoutKey(draggingKey);
    this.tempData = insertItem(withOutItemData, index, item);
    this.tempTo = index;
    this.tempSectionIndices = relocateSections(
      this.tempSectionIndices,
      this.tempData.length,
      index,
    );
    this.setState(
      prevState => ({
        ...prevState,
        data: this.tempData,
        sectionIndices: this.tempSectionIndices,
      }),
      () => {
        this.currIdx = index;
        this.activeCellSize = activeCellSize;
        this.moveBlocked = false;
        const ref = this._getRecycleRef();
        let rowLayout: Layout | undefined = undefined;
        if (!!ref) {
          rowLayout = ref.getLayout(index);
        }
        if (rowLayout) {
          this.props.onBeforeDrag(x, y + this.scrollOffset, rowLayout);
          this.updateHoverToLayout(rowLayout);
        } else {
          if (typeof this.props.getDraggingKey() !== 'undefined') {
            this.props.onBeforeDrag(x, y);
          }
        }
        // this.startedFromBoard.setValue(1);
      },
    );
    return index;
  };

  public moveItemBack = (item: any, atIndex: number) => {
    this.resetHoverState();
    const draggingKey = this.props.itemKeyExtractor(item);
    const withOutItemData = this.getTempDataWithoutKey(draggingKey);
    this.tempData = insertItem(withOutItemData, atIndex, item);
    this.tempSectionIndices = relocateSections(
      this.tempSectionIndices,
      this.tempData.length,
      atIndex,
    );
    this.setState({
      data: this.tempData,
      sectionIndices: this.tempSectionIndices,
    });
  };

  public stopFromBoard = () => {
    this.startedFromBoard.setValue(0);
    this.resetHoverState();
  };

  start = ([x, y]: ReadonlyArray<number>) => {
    if (!!this.props.getDraggingKey()) return; //Just start if no dragging key
    this.currIdx = this.yToIndex(y);
    //Save top item distance;
    const ref = this._getRecycleRef();
    if (!!ref) {
      if (this.currIdx >= 0) {
        const rowLayout = ref.getLayout(this.currIdx);
        if (rowLayout) {
          this.activeCellSize = rowLayout.height;
          this.props.onBeforeDrag(x, y + this.scrollOffset, rowLayout);
        }
      }
    }
  };

  getCurrentItem = ([x, y]: ReadonlyArray<number>): any | undefined => {
    const index = this.yToIndex(y);
    return this.state.data[index];
  };

  isInBound = (index: number) => {
    if (index >= this.tempData.length) return false;
    if (index < 0) return false;
    return true;
  };

  generateMoveLayout = (
    index: number,
    direction: 'up' | 'down',
  ): Layout | undefined => {
    const ref = this._getRecycleRef();
    if (!ref) return undefined;
    if (!this.isInBound(index)) return undefined;
    const tempLayout: Layout | undefined = this.getTempLayoutByKey(
      this.tempKeyExtractor(index),
    );
    const originLayout: Layout | undefined = tempLayout
      ? tempLayout
      : ref.getLayout(index);
    if (originLayout) {
      const newLayout: Layout = {...originLayout};
      newLayout.y =
        direction === 'up'
          ? originLayout.y - this.activeCellSize
          : originLayout.y + this.activeCellSize;
      return newLayout;
    }
    return undefined;
  };

  generateFromToLayout = (
    from: number,
    to: number,
  ): [Layout | undefined, number] => {
    let distance = 0;
    const ref = this._getRecycleRef();
    if (!ref) return [undefined, distance];
    if (!this.isInBound(from)) return [undefined, distance];
    if (!this.isInBound(to)) return [undefined, distance];

    const tempFrom: Layout | undefined = this.getTempLayoutByKey(
      this.tempKeyExtractor(from),
    );
    const nearLayout: Layout | undefined = this.getTempLayoutByKey(
      this.tempKeyExtractor(to),
    );
    const originLayout: Layout | undefined = tempFrom
      ? tempFrom
      : ref.getLayout(from);
    const toLayout: Layout | undefined = nearLayout
      ? nearLayout
      : ref.getLayout(to);
    if (originLayout) {
      if (from < to) {
        if (nearLayout) {
          const newLayout: Layout = {...originLayout};
          newLayout.y = nearLayout.y + nearLayout.height;
          distance = newLayout.y - originLayout.y;
          return [newLayout, distance];
        }
      } else if (from > to) {
        if (toLayout) {
          const newLayout: Layout = {...originLayout};
          distance = newLayout.y - toLayout.y;
          newLayout.y = toLayout.y;
          return [newLayout, distance];
        }
      }
    }
    return [undefined, distance];
  };

  updateHoverToLayout = (layout: Layout) => {
    this.hoverLayoutOffset.setValue(layout.y);
  };

  moveItemTo = (from: number, to: number) => {
    if (typeof this.tempFrom === 'undefined') {
      this.tempFrom = from;
    }
    this.tempTo = to;

    if (from < to) {
      for (let index = from + 1; index <= to; index++) {
        const key = this.tempKeyExtractor(index);
        if (key) {
          const cell = this.cellData.get(key);
          if (cell) {
            cell.setValue(sub(cell, this.activeCellSize));
          }
          this.tempLayoutMap.set(key, {
            index: index - 1,
            layout: this.generateMoveLayout(index, 'up'),
          });
        }
      }
      const key = this.tempKeyExtractor(from);
      {
        if (key) {
          const [layout, distance] = this.generateFromToLayout(from, to);
          if (layout) {
            this.updateHoverToLayout(layout);
          }
          this.tempLayoutMap.set(key, {
            index: to,
            layout,
          });
          const cell = this.cellData.get(key);
          if (cell) {
            cell.setValue(add(cell, distance));
          }
        }
      }
    } else if (from > to) {
      const key = this.tempKeyExtractor(from);
      {
        if (key) {
          const [layout, distance] = this.generateFromToLayout(from, to);
          if (layout) {
            this.updateHoverToLayout(layout);
          }
          this.tempLayoutMap.set(key, {
            index: to,
            layout,
          });
          const cell = this.cellData.get(key);
          if (cell) {
            cell.setValue(sub(cell, distance));
          }
        }
      }
      for (let index = from - 1; index >= to; index--) {
        const key = this.tempKeyExtractor(index);
        if (key) {
          const cell = this.cellData.get(key);
          if (cell) {
            cell.setValue(add(cell, this.activeCellSize));
          }
          this.tempLayoutMap.set(key, {
            index: index - 1,
            layout: this.generateMoveLayout(index, 'down'),
          });
        }
      }
    }
    this.tempData = immutableMove(this.tempData, from, to);
    this.tempSectionIndices = relocateSections(
      this.tempSectionIndices,
      from,
      to,
    );
  };

  tempKeyExtractor = (index: number) => {
    const data = this.tempData[index];
    if (typeof data === 'undefined') return undefined;
    if (this._tempIsSection(index)) {
      return this.props.sectionKeyExtractor(data);
    }
    return this.props.itemKeyExtractor(data);
  };

  private _tempIsSection = (index: number) => {
    return typeof this.tempSectionIndices[index] !== 'undefined';
  };

  getDistFromTop = () => {
    return Math.max(0, this.props.getLastMoveY() || 0);
  };

  getDistFromBottom = () => {
    return Math.max(0, this.containerSize - (this.props.getLastMoveY() || 0));
  };

  getScrollTargetOffset = () => {
    if (this.isAutoscrolling) return -1;
    const distFromTop = this.getDistFromTop();
    const distFromBottom = this.getDistFromBottom();
    const {listAutoScrollThreshold, listAutoScrollSpeed} = this.props;
    const scrollUp = distFromTop < listAutoScrollThreshold!;
    const scrollDown = distFromBottom < listAutoScrollThreshold!;
    if (
      !(scrollUp || scrollDown) ||
      (scrollUp && this.isScrolledUp()) ||
      (scrollDown && this.isScrolledDown())
    ) {
      this.isAutoscrolling = false;
      return -1;
    }
    const distFromEdge = scrollUp ? distFromTop : distFromBottom;
    const speedPct =
      Math.round(
        ((listAutoScrollThreshold - distFromEdge) / listAutoScrollThreshold) *
          10,
      ) / 10;
    const offset = speedPct * listAutoScrollSpeed;
    const targetOffset = scrollUp
      ? Math.max(0, this.scrollOffset - offset)
      : this.scrollOffset + offset;
    return targetOffset;
  };

  move = ([x, y]: ReadonlyArray<number>) => {
    if (!this.hasPressedIn()) return;
    if (this.currIdx === -1) {
      this.start([x, y]);
    }
    //Show when first move;
    if (!this.props.getDraggingKey()) {
      if (this.currIdx >= 0) {
        const key = this.keyExtractor(this.currIdx);
        const index = this.currIdx;
        const data =
          typeof this.state.data[index] === 'object'
            ? {...this.state.data[index]}
            : this.state.data[index];
        const ref = this._getRecycleRef();
        if (!!ref) {
          const rowLayout = ref.getLayout(this.currIdx);
          if (rowLayout) {
            this.updateHoverToLayout(rowLayout);
          }
        }
        this.props.onHasMoved(this.props.listKey, 1, key, {
          listKey: this.props.listKey,
          data,
          index,
        });
      }
    }
    const distFromTop = this.getDistFromTop();
    const distFromBottom = this.getDistFromBottom();
    const {listAutoScrollThreshold} = this.props;
    const scrollUp = distFromTop < listAutoScrollThreshold!;
    const scrollDown = distFromBottom < listAutoScrollThreshold!;
    if (
      !this.autoScrollEnabled ||
      (!scrollUp && !scrollDown) ||
      (scrollUp && this.isScrolledUp()) ||
      (scrollDown && this.isScrolledDown())
    ) {
      this.isAutoscrolling = false;
      if (y >= 0 || Platform.OS !== 'android') {
        const data = this.getCurrentItem([0, y]);
        if (!this.props.canReorderItem(data)) return;
        this.updateOrder(y);
      }
    }
  };

  _getRecycleRef = () => {
    if (!this.list.current || !this.list.current._component) return null;
    return this.list.current._component;
  };

  scrollToOffset = (offset: number, animated: boolean = false) => {
    const ref = this._getRecycleRef();
    if (!ref) return;
    if (ref.scrollToOffset) {
      ref.scrollToOffset(offset, offset, animated);
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
        ref.scrollToOffset(offset, offset, false);
      }
    }
  };

  autoscroll = () => {
    if (!this.autoScrollEnabled) return;
    const targetOffset = this.getScrollTargetOffset();
    if (targetOffset >= 0 && this.props.hasPressedIn()) {
      const lastMoveY = this.props.getLastMoveY();
      if (typeof lastMoveY === 'number' && lastMoveY >= 0) {
        const data = this.getCurrentItem([0, lastMoveY]);
        if (!this.props.canReorderItem(data)) return;
        this.updateOrder(lastMoveY);
        //TODO: maybe it lead to wrong y to update order
      }
      this.autoScrollToOffset(targetOffset);
      requestAnimationFrame(this.autoscroll);
    }
  };

  checkAutoscroll = cond(
    eq(this.gestureState, GestureState.ACTIVE),
    call([], this.autoscroll),
  );

  updateOrder = (y: number) => {
    const newIdx = this.yToIndex(y, true);
    if (newIdx === -1) return;
    if (this.currIdx === -1) {
      this.currIdx === newIdx;
      return;
    }
    if (this.currIdx !== newIdx) {
      this.moveItemTo(this.currIdx, newIdx);
      this.currIdx = newIdx;
    }
  };

  getTempLayoutByKey = (key: any): Layout | undefined => {
    if (typeof key === 'string') {
      const tempLayout = this.tempLayoutMap.get(key);
      if (tempLayout && tempLayout.layout) {
        return tempLayout.layout;
      }
    }
    return undefined;
  };

  getLayoutByIndex = (index: number): Layout | undefined => {
    const ref = this._getRecycleRef();
    if (!ref) return undefined;
    if (this.isInBound(index)) {
      const key = this.tempKeyExtractor(index);
      const layout = this.getTempLayoutByKey(key);
      if (layout) return layout;
    }
    return ref.getLayout(index);
  };

  yToIndex = (y: number, dragging: boolean = false): number => {
    const ref = this._getRecycleRef();
    if (!ref) return -1;
    const offset = y + this.scrollOffset;
    const useTemp = true;

    //Skip layout by current layout
    let startIndex = 0;
    if (this.currIdx > 0) {
      const index = this._visibleIndices.indexOf(this.currIdx);
      if (index > 0) {
        const rowLayout = this.getLayoutByIndex(this.currIdx);
        if (rowLayout) {
          const {y: currentOffset} = rowLayout;
          if (offset >= currentOffset) {
            startIndex = index;
          }
        }
      }
    }
    for (let i = startIndex; i < this._visibleIndices.length; i++) {
      const index = this._visibleIndices[i];
      const rowLayout = useTemp
        ? this.getLayoutByIndex(index)
        : ref.getLayout(index);
      const nextLayout = useTemp
        ? this.getLayoutByIndex(index + 1)
        : ref.getLayout(index + 1);
      if (rowLayout) {
        const {y: itemOffset, height: itemHeight} = rowLayout;

        //Drag to top of list
        if (offset < itemOffset && index === 0) {
          return 0;
        }
        //Skip invisible row
        if (itemHeight <= 0) {
          continue;
        }

        const itemMiddle = itemOffset + itemHeight / 2;
        const itemBottomBound = itemMiddle + Math.min(itemHeight / 3, 10);
        const mustUpdateOffset = dragging ? itemMiddle : itemOffset;
        if (nextLayout) {
          const {y: nextItemOffset, height: nextItemHeight} = nextLayout;
          const nextMustUpdateOffsetTopBound = dragging
            ? nextItemOffset +
              nextItemHeight / 2 -
              Math.min(nextItemHeight / 3, 10)
            : nextItemOffset;
          if (
            offset >= mustUpdateOffset &&
            offset < nextMustUpdateOffsetTopBound
          ) {
            if (dragging) {
              //Check moving up
              if (index < this.currIdx) {
                if (offset < itemBottomBound) {
                  return index;
                } else {
                  return this.currIdx;
                }
              }
            }
            return index;
          }
        } else {
          if (offset >= mustUpdateOffset) return index;
        }
      }
    }
    if (dragging) {
      return this.yToIndex(y);
    } else {
      return -1;
    }
  };

  rowRenderer = (
    type: React.ReactText,
    data: any,
    index: number,
    extendedState,
  ) => {
    const key = this.keyExtractor(index);
    let nodeValue: Animated.Value<number>;
    if (!this.cellData.has(key)) {
      nodeValue = new Animated.Value(0);
      this.cellData.set(key, nodeValue);
    } else {
      nodeValue = this.cellData.get(key)!;
    }

    return (
      <RowItem
        renderer={
          type === ItemTypes.Section
            ? this.props.sectionRenderer
            : this.props.itemRenderer
        }
        listKey={this.props.listKey}
        data={data}
        index={index}
        onPressIn={
          type === ItemTypes.Section
            ? this.props.onSectionPressedIn
            : this.props.onItemPressedIn
        }
        extendedState={extendedState}
        nodeValue={nodeValue}
      />
    );
  };

  keyExtractor = (index: number) => {
    const data = this.state.data[index];
    if (this._isSection(index)) {
      return this.props.sectionKeyExtractor(data);
    }
    return this.props.itemKeyExtractor(data);
  };

  private _isSection = (index: number) => {
    return typeof this.state.sectionIndices[index] !== 'undefined';
  };

  getLayoutTypeForIndex = (index: number): ItemTypes => {
    return this._isSection(index) ? ItemTypes.Section : ItemTypes.Item;
  };

  setLayoutForType = (type: React.ReactText, dim: Dimension, index: number) => {
    dim.width = this._itemWidth;
    const data = this.state.data[index];
    if (typeof data === 'undefined') {
      dim.height = 0;
    } else {
      if (type === ItemTypes.Section) {
        if (this.props.getSectionHeight) {
          dim.height = this.props.getSectionHeight(data, index);
        } else {
          dim.height = 0;
        }
      } else {
        dim.height = this.props.getItemHeight(data, index);
      }
    }
  };

  onVisibleIndicesChanged = (all: number[]) => {
    this._visibleIndices = all;
  };

  handleLayout = (e: LayoutChangeEvent) => {
    this.containerSize = e.nativeEvent.layout.height;
    this.containerTopOffset = e.nativeEvent.layout.y;
  };

  onListContentSizeChange = (w: number, h: number) => {
    this.scrollViewSize = h;
  };

  render() {
    const Wrapper = this.props.listWrapper;
    const ContentWrapper = this.props.listContentWrapper;
    const draggingKey = this.props.getDraggingKey();
    const active =
      this.props.draggingState.activeListKey === this.props.listKey;
    return (
      <Wrapper listKey={this.props.listKey} active={active}>
        <ContentWrapper
          listKey={this.props.listKey}
          active={active}
          data={this.props.listData}>
          <Animated.View style={styles.container}>
            {this.state.data.length > 0 && (
              <TransitionViewController
                animationNextTransition={this.props.animationNextTransition}
                listKey={this.props.listKey}
                dataLength={this.state.data.length}
              />
            )}
            <AnimatedListView
              ref={this.list}
              data={this.state.data}
              rowRenderer={this.rowRenderer}
              keyExtractor={this.keyExtractor}
              getLayoutTypeForIndex={this.getLayoutTypeForIndex}
              setLayoutForType={this.setLayoutForType}
              onVisibleIndicesChanged={this.onVisibleIndicesChanged}
              onLayout={this.handleLayout}
              extendedState={this.props.draggingState}
              externalScrollView={this.scrollView}
              firstModifiedIndex={this._firstModifiedIndex}
              renderHeader={this.props.renderHeader}
              renderFooter={this.props.renderFooter}
              onContentSizeChange={this.onListContentSizeChange}
              initialOffset={this.state.initialOffset}
            />
            <Animated.Code>
              {() =>
                cond(
                  and(
                    this.startedFromBoard,
                    eq(this.gestureState, GestureState.ACTIVE),
                  ),
                  call([this.touchX, this.touchY], this.move),
                )
              }
            </Animated.Code>
            <Animated.Code>
              {() =>
                block([
                  onChange(
                    this.gestureState,
                    cond(
                      or(
                        eq(this.gestureState, GestureState.END),
                        eq(this.gestureState, GestureState.CANCELLED),
                        eq(this.gestureState, GestureState.FAILED),
                      ),
                      this.onGestureRelease,
                    ),
                  ),
                ])
              }
            </Animated.Code>

            <Animated.Code>
              {() =>
                block([
                  onChange(
                    this.touchY,
                    cond(this.startedFromBoard, this.checkAutoscroll),
                  ),
                ])
              }
            </Animated.Code>
            <Animated.Code>
              {() =>
                block([
                  onChange(this.hoverLayoutOffset, this.checkUpdateHoverToY),
                  onChange(this.hoverTopNative, this.checkUpdateHoverToY),
                  onChange(this.hoverTranslateY, this.checkUpdateHoverToY),
                  onChange(this.headerHeight, this.checkUpdateHoverToY),
                ])
              }
            </Animated.Code>
          </Animated.View>
        </ContentWrapper>
      </Wrapper>
    );
  }
}

export default List;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  drag: {
    position: 'absolute',
    left: 0,
  },
});
