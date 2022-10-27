import React from 'react';
import {
  Platform,
  TouchableOpacityProperties,
  TouchableNativeFeedbackProps,
  View,
  TouchableOpacity,
  TouchableHighlight,
  // TouchableNativeFeedback,
} from 'react-native';

import {TouchableNativeFeedback} from 'react-native-gesture-handler';

export type BaseButtonProps = TouchableOpacityProperties &
  TouchableNativeFeedbackProps;

export interface IBaseButtonProps extends BaseButtonProps {
  children: any;
}

export const BaseButton = (props: IBaseButtonProps) => {
  const {style, ...restProps} = props;
  if (Platform.OS === 'android') {
    return (
      <TouchableNativeFeedback {...restProps}>
        <View style={style}>{props.children}</View>
      </TouchableNativeFeedback>
    );
  }

  return (
    <TouchableOpacity {...restProps} style={style}>
      {props.children}
    </TouchableOpacity>
  );
};
