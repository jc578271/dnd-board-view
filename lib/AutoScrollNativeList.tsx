import React from 'react';
import NativeListComponent, {NativeListProps} from './NativeList';
import {event, block, set, call} from 'react-native-reanimated';
import {NativeScrollEvent} from 'react-native';

export const scrollPositionTolerance = 2;

export default abstract class AutoScrollNativeList<
  P extends NativeListProps,
  S
> extends NativeListComponent<P, S> {
  targetScrollOffset = 0;
  isAutoscrolling = false;
  scrollViewSize = 0;
  containerSize = 0;
  startAutoScrollOffset = 0;
  autoScrollEnabled = true;

  abstract autoscroll(): void;

  constructor(props: P) {
    super(props);
  }

  isScrolledUp = () => {
    return this.scrollOffset <= scrollPositionTolerance;
  };

  isScrolledDown = () => {
    return (
      this.scrollOffset + this.containerSize + scrollPositionTolerance >=
      this.scrollViewSize
    );
  };

  public updateAutoScrolling = () => {
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
        requestAnimationFrame(this.autoscroll);
      }
    }
  };

  onNativeScroll = ([offset]: Readonly<Array<number>>) => {
    this.scrollOffset = offset;
    this.updateAutoScrolling();
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
