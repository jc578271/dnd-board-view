import React, {memo} from 'react';
import Animated, {Easing} from 'react-native-reanimated';
import {withTimingTransition} from 'react-native-redash';
import {StyleSheet, Platform} from 'react-native';

const transitionConfig = {
  duration: Platform.OS === 'ios' ? 400 : 250,
  easing: Easing.inOut(Easing.ease),
};

interface OwnProps {
  nodeValue: Animated.Value<number>;
  listKey: string;
  data: any;
  index: number;
  onPressIn: () => void;
  extendedState: object;
  renderer: (
    listKey: string,
    data: any,
    index: number,
    onPressIn: () => void,
    extendedState: object,
  ) => JSX.Element | JSX.Element[] | null;
}

type Props = OwnProps;

export const RowItem = ({
  nodeValue,
  renderer,
  listKey,
  data,
  index,
  onPressIn,
  extendedState,
}: Props) => {
  const transitionVal = withTimingTransition(nodeValue, transitionConfig);
  return (
    <Animated.View
      style={[styles.container, {transform: [{translateY: transitionVal}]}]}>
      {renderer(listKey, data, index, onPressIn, extendedState)}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
});
