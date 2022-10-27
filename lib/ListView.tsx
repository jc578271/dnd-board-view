import React, {
  PureComponent,
  memo,
  useRef,
  useLayoutEffect,
  PropsWithChildren,
  useEffect,
} from 'react';
import {
  StyleSheet,
  ScrollViewProps,
  Platform,
  View,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import {
  BaseItemAnimator,
  DataProvider,
  Dimension,
  LayoutProvider,
  RecyclerListView,
} from 'base-recyclerlistview';
import {RecyclerListViewProps} from 'base-recyclerlistview/dist/reactnative/core/RecyclerListView';
import {
  Transition,
  Transitioning,
  TransitioningView,
} from 'react-native-reanimated';
import values from 'lodash/values';
import {usePrevious} from './hooks';

const defaultScrollViewProps: ScrollViewProps = {
  showsVerticalScrollIndicator: false,
  showsHorizontalScrollIndicator: false,
};

const itemAnimator = new BaseItemAnimator();

interface MRLVProps
  extends RecyclerListViewProps,
    Pick<ScrollViewProps, 'scrollEnabled' | 'onLayout'> {}

interface OwnProps extends Omit<MRLVProps, 'dataProvider' | 'layoutProvider'> {
  data: any[];
  keyExtractor: (index: number) => string;
  getLayoutTypeForIndex: (index: number) => React.ReactText;
  setLayoutForType: (
    type: React.ReactText,
    dim: Dimension,
    index: number,
  ) => void;
  setLandscapeLayoutForType?: (
    type: React.ReactText,
    dim: Dimension,
    index: number,
  ) => void;
  firstModifiedIndex?: number;
}

type Props = OwnProps;

type State = Readonly<{
  layoutProvider: LayoutProvider;
  dataProvider: DataProvider;
}>;

export class ListView extends PureComponent<Props, State> {
  _dataProvider: DataProvider;
  _portraitLayout: LayoutProvider;
  _landscapeLayout: LayoutProvider;
  _ref = React.createRef<RecyclerListView<MRLVProps, any>>();

  constructor(props: Props) {
    super(props);
    this._dataProvider = new DataProvider(
      (r1, r2) => r1 !== r2,
      (index: number) => {
        return this.props.keyExtractor(index);
      },
    );

    this._portraitLayout = new LayoutProvider(
      this.props.getLayoutTypeForIndex,
      this.props.setLayoutForType,
    );

    this._landscapeLayout = new LayoutProvider(
      this.props.getLayoutTypeForIndex,
      this.props.setLandscapeLayoutForType
        ? this.props.setLandscapeLayoutForType
        : this.props.setLayoutForType,
    );

    const {width, height} = Dimensions.get('window');
    const isLandscape = width > height;

    this.state = {
      dataProvider: this._dataProvider.cloneWithRows(
        this.props.data,
        undefined,
        true,
      ),
      layoutProvider: isLandscape
        ? this._landscapeLayout
        : this._portraitLayout,
    };
  }

  public scrollToOffset = (
    x: number,
    y: number,
    animate: boolean = false,
  ): void => {
    if (this._ref && this._ref.current) {
      this._ref.current.scrollToOffset(x, y, animate);
    }
  };

  public getLayout = (index: number) => {
    if (this._ref && this._ref.current) {
      return this._ref.current.getLayout(index);
    }
  };

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (this.props.data !== prevProps.data) {
      const dp = this.state.dataProvider.cloneWithRows(
        this.props.data,
        this.props.firstModifiedIndex,
        true,
      );
      this.setState(prevState => {
        return {
          ...prevState,
          dataProvider: dp,
        };
      });
    }
  }

  onLayout = (event: LayoutChangeEvent) => {
    if (this.props.onLayout) {
      this.props.onLayout(event);
    }
    const {width, height} = Dimensions.get('window');
    const isLandscape = width > height;
    const newLayoutProvider = isLandscape
      ? this._landscapeLayout
      : this._portraitLayout;
    if (newLayoutProvider !== this.state.layoutProvider) {
      this.setState((prevState: State) => {
        return {
          ...prevState,
          layoutProvider: newLayoutProvider,
        };
      });
    }
  };

  render() {
    const {
      data,
      keyExtractor,
      getLayoutTypeForIndex,
      setLayoutForType,
      setLandscapeLayoutForType,
      firstModifiedIndex,
      ...rlvProps
    } = this.props;
    return (
      <MemoRecyclerListView
        ref={this._ref}
        layoutProvider={this.state.layoutProvider}
        dataProvider={this.state.dataProvider}
        itemAnimator={itemAnimator}
        optimizeForInsertDeleteAnimations={true}
        scrollViewProps={defaultScrollViewProps}
        canChangeSize={true}
        {...rlvProps}
        onLayout={this.onLayout}
      />
    );
  }
}

const TRANSITION_DURATION = 150;
export const DEBOUNCE_DURATION = TRANSITION_DURATION;
const transitionDuration = Platform.OS === 'ios' ? 250 : 250;
const transition = (
  <Transition.Sequence>
    {/* <Transition.Out
      type="fade"
      interpolation="linear"
      durationMs={transitionDuration}
    /> */}
    <Transition.Change interpolation="linear" durationMs={transitionDuration} />
    <Transition.In
      type="fade"
      interpolation="linear"
      durationMs={transitionDuration}
    />
  </Transition.Sequence>
);

const ForwardRefRecyclerListView = React.forwardRef<
  RecyclerListView<MRLVProps, any>,
  MRLVProps
>((props, ref) => {
  const {dataProvider} = props;

  //TODO: handle empty data, renderHeader, footer, empty stage;

  const hasData = dataProvider.getSize() > 0;

  return (
    // <CommonTransitionView dataLength={dataProvider.getSize()}>
    //   {hasData && (
    //     <RecyclerListView style={styles.container} {...props} ref={ref} />
    //   )}
    // </CommonTransitionView>
    <View style={styles.container}>
      {hasData && (
        <RecyclerListView style={styles.container} {...props} ref={ref} />
      )}
    </View>
  );
});

const MemoRecyclerListView = memo(ForwardRefRecyclerListView);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minHeight: 1,
  },
});

const CommonTransitionView = memo(
  ({children, ...props}: PropsWithChildren<any>) => {
    const transitionRef = useRef<TransitioningView>(null);
    const property = values(props);
    useLayoutEffect(() => {
      if (transitionRef.current) {
        transitionRef.current.animateNextTransition();
      }
    }, property);

    return (
      <Transitioning.View
        style={styles.container}
        {...{transition, ref: transitionRef}}>
        {children}
      </Transitioning.View>
    );
  },
);

const ForwardRefControlTransitionView = React.forwardRef<
  TransitioningView,
  any
>(({children}: PropsWithChildren<any>, ref) => {
  return (
    <Transitioning.View
      style={styles.container}
      transition={transition}
      ref={ref}>
      {children}
    </Transitioning.View>
  );
});

export const ControlTransitionView = memo(ForwardRefControlTransitionView);

interface TransitionViewControllerProps {
  animationNextTransition: () => void;
  dataLength: any;
  listKey: string;
}

export const TransitionViewController = memo(
  ({
    animationNextTransition,
    listKey,
    dataLength,
  }: TransitionViewControllerProps) => {
    const previousDataLength = usePrevious(dataLength);
    const previousListKey = usePrevious(listKey);
    useLayoutEffect(() => {
      if (listKey === previousListKey) {
        if (dataLength !== previousDataLength) {
          animationNextTransition();
        }
      }
    }, [dataLength]);

    return null;
  },
);
