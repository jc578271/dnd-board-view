import React from 'react';
import {BaseScrollView} from 'base-recyclerlistview';
import Animated from 'react-native-reanimated';
import {ScrollViewDefaultProps} from 'base-recyclerlistview/dist/reactnative/core/scrollcomponent/BaseScrollView';

interface Props extends ScrollViewDefaultProps {
  renderHeader?: () => JSX.Element | JSX.Element[] | null;
}
export class NativeBaseScrollView extends BaseScrollView {
  ref = React.createRef<Animated.ScrollView>();

  constructor(props: Props) {
    super(props);
  }

  scrollTo = (...args) => {
    if (this.ref && this.ref.current) {
      this.ref.current.getNode().scrollTo(...args);
    }
  };

  renderHeader = () => {
    if (this.props.renderHeader) {
      return this.props.renderHeader();
    }
    return null;
  };

  render() {
    return (
      <Animated.ScrollView
        scrollEventThrottle={1}
        {...this.props}
        ref={this.ref}
        onScroll={this.props.onScroll}>
        {this.renderHeader()}
        {this.props.children}
      </Animated.ScrollView>
    );
  }
}
