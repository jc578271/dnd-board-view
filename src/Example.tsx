import React, {memo, useCallback, PropsWithChildren} from 'react';
import {
  SafeAreaView,
  Text,
  View,
  Dimensions,
  StyleSheet,
  Alert,
  ViewProps,
} from 'react-native';
import {BoardExtendedState, ListData, SectionData} from '../lib/types';
import {Board} from '../lib/Board';
import styled from 'styled-components/native';
import {BaseButton, IBaseButtonProps} from '../lib/components';
import {TouchableWithoutFeedback} from 'react-native-gesture-handler';

const defaultDelayLongPress = 800;
let dims = Dimensions.get('screen');
let screenWidth = dims.width;
let screenHeight = dims.height;
const [shortDimension] =
  screenWidth < screenHeight
    ? [screenWidth, screenHeight]
    : [screenHeight, screenWidth];

const NEXT_CARD_VISIBLE_WITH = 16;
const CARD_SPACING = 8;
const LIST_WIDTH =
  (shortDimension <= 414 ? shortDimension : 414) -
  (NEXT_CARD_VISIBLE_WITH + CARD_SPACING) * 2;

const LIST_ITEM_WIDTH = LIST_WIDTH - CARD_SPACING * 4;

const heightArray = [80, 120, 150];

const heightMap = {};

const getRandomHeight = (data: string) => {
  if (typeof heightMap[data] === 'undefined') {
    heightMap[data] =
      heightArray[Math.floor(Math.random() * 3)] || heightArray[0];
  }
  return heightMap[data];
};

const HEADER_HEIGHT = 50;

const EmptyContainer = styled.View`
  width: 100%;
  height: ${HEADER_HEIGHT}px;
  flex-direction: row;
  align-items: center;
  background-color: white;
`;

const FooterContainer = styled(EmptyContainer)`
  border-top-width: 1px;
  border-top-color: rgba(0, 0, 0, 0.1);
`;
const HeaderContainer = styled(EmptyContainer)`
  position: absolute;
  top: 0;
  left: 0;
  box-shadow: 0px 3px 3px rgba(0, 0, 0, 0.3);
  elevation: 3;
`;

const CardItem = styled<IBaseButtonProps>(BaseButton).attrs(() => ({
  underlayColor: '#eee',
}))`
  width: 100%;
  height: 100%;
  background-color: white;
  padding: ${CARD_SPACING}px;
  box-shadow: 0px 1px 1px rgba(0, 0, 0, 0.3);
`;
interface CustomSectionData extends SectionData {
  id: string;
}

interface CustomListData extends ListData {
  id: string;
  data: CustomSectionData[];
}

const generateItem = (listIndex: number, i: number) => {
  const data = listIndex.toString() + i.toString();
  return data;
};

const generateArray = (
  listIndex: number,
  numberOfSection: number,
  itemPerSection: number,
): CustomSectionData[] => {
  const data: CustomSectionData[] = [];
  let sectionCount = 0;
  for (let i = 0; i < numberOfSection; i++) {
    const section: CustomSectionData = {
      id: i === 0 ? `Hidden-${i + 1}` : `Section-${i + 1}`,
      data: Array.from(Array(itemPerSection), (_, i) => {
        return generateItem(listIndex, sectionCount * itemPerSection + i);
      }),
    };
    sectionCount += 1;
    data.push(section);
  }
  return data;
};

const generateBoardData = (
  numberOfList: number,
  numberOfSection: number,
  itemPerSection: number,
): CustomListData[] => {
  const data: CustomListData[] = [];
  for (let listIndex = 0; listIndex < numberOfList; listIndex++) {
    const sections = generateArray(listIndex, numberOfSection, itemPerSection);
    const listData: CustomListData = {
      id: `list-${listIndex + 1}`,
      data: sections,
    };
    data.push(listData);
  }

  return data;
};
interface Props {}
interface State {
  data: CustomListData[];
}
class App extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      data: generateBoardData(20, 2, 20),
    };
  }

  listKeyExtractor = (data: CustomListData) => data.id;
  sectionKeyExtractor = (data: CustomSectionData) => data.id;
  itemKeyExtractor = (data: string) => data;

  sectionRenderer = (
    listKey: string,
    data: any,
    index: number,
    onPressIn: () => void,
    _,
  ) => {
    return (
      <SectionItem
        data={this.sectionKeyExtractor(data)}
        onPressIn={onPressIn}
      />
    );
  };

  getSectionHeight = (data: any) => {
    try {
      const sectionKey = this.sectionKeyExtractor(data);
      if (typeof sectionKey === 'string') {
        return sectionKey.toLowerCase().startsWith('hidden')
          ? 0
          : SECTION_HEIGHT;
      }
      return 0;
    } catch {
      return 0;
    }
  };

  itemRenderer = (
    listKey: string,
    data: any,
    index: number,
    onPressIn: () => void,
    extendedState: BoardExtendedState,
  ) => {
    const itemKey = this.itemKeyExtractor(data);
    return (
      <RowItem
        data={itemKey}
        onPress={this.onPress}
        onPressIn={onPressIn}
        isDragging={itemKey === extendedState.draggingKey}
      />
    );
  };

  draggingItemRender = (itemKey: string) => {
    if (itemKey.toLocaleLowerCase().startsWith('section')) {
      return <SectionItem data={itemKey} />;
    }
    return <RowItem data={itemKey} isDragging={false} />;
  };

  getItemHeight = (data: any) => {
    const itemKey = this.itemKeyExtractor(data);
    return getRandomHeight(itemKey);
  };

  onPress = (data: string) => {
    Alert.alert('Item pressed', data);
  };

  renderSpacer = () => {
    return <Spacer />;
  };

  onDragEnd = (
    sourceKey: string,
    destinationKey: string,
    itemData: any,
    previousItemData: any | undefined,
    fromIndex: number,
    toIndex: number,
  ) => {
    console.log(
      '[APP] onDragEnd: ',
      sourceKey,
      destinationKey,
      itemData,
      previousItemData,
      fromIndex,
      toIndex,
    );
  };

  render() {
    return (
      <SafeAreaView style={{flex: 1, backgroundColor: '#00008B'}}>
        <AppBar />
        <Board
          data={this.state.data}
          listContainerWidth={LIST_WIDTH}
          contentContainerStyle={styles.board}
          listKeyExtractor={this.listKeyExtractor}
          sectionKeyExtractor={this.sectionKeyExtractor}
          itemKeyExtractor={this.itemKeyExtractor}
          listWrapper={ListWrapper}
          listContentWrapper={ListContentWrapper}
          listItemWidth={LIST_ITEM_WIDTH}
          sectionRenderer={this.sectionRenderer}
          getSectionHeight={this.getSectionHeight}
          itemRenderer={this.itemRenderer}
          draggingItemRender={this.draggingItemRender}
          getItemHeight={this.getItemHeight}
          delayLongPress={defaultDelayLongPress}
          draggingTranslateX={CARD_SPACING * 2}
          draggingTranslateY={HEADER_HEIGHT}
          renderHeader={this.renderSpacer}
          renderFooter={this.renderSpacer}
          headerHeight={CARD_SPACING / 2}
          onDragEnd={this.onDragEnd}
          sideSpacing={CARD_SPACING * 3}
          crossListTolerance={CARD_SPACING * 2}
        />
      </SafeAreaView>
    );
  }
}

export default App;

const Spacer = memo(() => <View style={{height: CARD_SPACING / 2}} />);

const SECTION_HEIGHT = 50;

interface RowProps {
  data: string;
  onPress?: (data: string) => void;
  onPressIn?: () => void;
  isDragging: boolean;
}

const RowItem = memo(({data, onPress, onPressIn, isDragging}: RowProps) => {
  const onPressCb = useCallback(() => {
    onPress && onPress(data);
  }, [data, onPress]);

  return (
    <View style={[styles.container, {opacity: isDragging ? 0 : 1}]}>
      <CardItem onPress={onPressCb} onPressIn={onPressIn}>
        <>
          <Text style={styles.itemTitle}>{'Title ' + data}</Text>
          <Text style={styles.itemDescription}>
            {'This is description of ' + data}
          </Text>
        </>
      </CardItem>
    </View>
  );
});

interface SectionProps {
  data: string;
  onPressIn?: () => void;
}

const SectionItem = memo(({data, onPressIn}: SectionProps) => {
  if (typeof data !== 'string' || data.toLowerCase().startsWith('hidden'))
    return null;
  return (
    <TouchableWithoutFeedback onPressIn={onPressIn} style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionText}>CÔNG VIỆC ĐÃ HOÀN THÀNH</Text>
        <View style={styles.sectionDivider} />
      </View>
    </TouchableWithoutFeedback>
  );
});

export const AppBar = memo(() => {
  return (
    <View style={{height: 44, width: '100%'}}>
      <Text
        style={{
          fontSize: 18,
          color: 'white',
          fontWeight: 'bold',
          paddingHorizontal: 16,
        }}>
        App title
      </Text>
    </View>
  );
});

interface ListWrapperProps extends ViewProps {
  listKey: string;
}

export const ListWrapper = memo(
  ({listKey, children, ...props}: PropsWithChildren<ListWrapperProps>) => {
    return (
      <View
        {...props}
        key={listKey}
        style={{
          width: LIST_WIDTH,
          flex: 1,
          paddingHorizontal: CARD_SPACING,
        }}>
        {children}
      </View>
    );
  },
);

export const ListContentWrapper = memo(
  ({listKey, children, ...props}: PropsWithChildren<ListWrapperProps>) => {
    return (
      <View
        {...props}
        style={{
          width: '100%',
          flex: 1,
          alignItems: 'center',
          backgroundColor: '#DDD',
          overflow: 'hidden',
        }}>
        <EmptyContainer pointerEvents="none" />
        <View
          style={{
            width: LIST_ITEM_WIDTH,
            flex: 1,
          }}>
          {children}
        </View>
        <HeaderContainer>
          <Text
            style={{
              color: '#333',
              fontSize: 20,
              paddingLeft: CARD_SPACING * 2,
            }}>
            {'Header ' + listKey}
          </Text>
        </HeaderContainer>
        <FooterContainer>
          <Text
            style={{
              color: '#333',
              fontSize: 20,
              paddingLeft: CARD_SPACING * 2,
            }}>
            {'Footer ' + listKey}
          </Text>
        </FooterContainer>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  animContainer: {
    width: '100%',
    height: '100%',
  },
  container: {
    width: '100%',
    height: '100%',
    paddingVertical: CARD_SPACING / 2,
  },
  itemTitle: {
    fontSize: 16,
    color: '#333',
  },
  itemDescription: {
    marginTop: 4,
    fontSize: 14,
    color: '#333',
  },
  itemText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  section: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    flexDirection: 'row',
  },
  sectionText: {
    fontSize: 14,
    color: '#639c11',
    paddingRight: 16,
  },
  sectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#639c11',
  },
  board: {
    paddingHorizontal: CARD_SPACING * 3,
  },
});
