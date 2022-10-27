import {Layout} from 'base-recyclerlistview';
export interface SectionIndices {
  [key: number]: null;
}

export enum ItemTypes {
  Item = 'boardItem',
  Section = 'boardSection',
}

export interface TempLayout {
  layout: Layout | undefined;
  index: number;
}

export interface SectionData {
  data: any[];
  [key: string]: any;
}

export interface FlattenData {
  data: any[];
  sectionIndices: SectionIndices;
}

export interface ListData {
  data: SectionData[];
  [key: string]: any;
}

export interface BoardExtendedState {
  activeListKey?: string | undefined;
  draggingKey?: string | undefined;
  forceRollback: number;
}
