import React, {forwardRef} from 'react';
import {NativeBaseScrollView} from './components/NativeBaseScrollView';
import {event, block, set, call, Value} from 'react-native-reanimated';
import {NativeScrollEvent} from 'react-native';

export interface NativeListProps {
  horizontal?: boolean;
}
export default class NativeListComponent<
  P extends NativeListProps,
  S
> extends React.PureComponent<P, S> {
  scrollOffset = 0;
  scrollOffsetNative = new Value<number>(this.scrollOffset);

  onOriginScroll = e => {};

  scrollView = forwardRef<NativeBaseScrollView, any>((props, ref) => {
    this.onOriginScroll = props.onScroll;
    return (
      <NativeBaseScrollView ref={ref} {...props} onScroll={this.onScroll} />
    );
  });

  onNativeScroll = ([offset]: Readonly<Array<number>>) => {
    this.scrollOffset = offset;
    const e = {
      nativeEvent: {
        contentOffset: {
          x: this.props.horizontal ? offset : 0,
          y: this.props.horizontal ? 0 : offset,
        },
      },
    };
    this.onOriginScroll(e);
  };

  onScroll = event([
    {
      nativeEvent: ({contentOffset}: NativeScrollEvent) =>
        block([
          set(
            this.scrollOffsetNative,
            this.props.horizontal ? contentOffset.x : contentOffset.y,
          ),
          call([this.scrollOffsetNative], this.onNativeScroll),
        ]),
    },
  ]);
}
