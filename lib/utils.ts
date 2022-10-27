import {SectionIndices, SectionData, FlattenData} from './types';

export const immutableMove = (arr: any[], from: number, to: number) => {
  const newArr = arr.reduce((prev, current, idx, self) => {
    if (from === to) {
      prev.push(current);
    }
    if (idx === from) {
      return prev;
    }
    if (from < to) {
      prev.push(current);
    }
    if (idx === to) {
      prev.push(self[from]);
    }
    if (from > to) {
      prev.push(current);
    }
    return prev;
  }, []);
  return newArr;
};

export const relocateSections = (
  sectionIndices: SectionIndices,
  from: number,
  to: number,
) => {
  const relocatedSectionIndices: SectionIndices = {};
  const sectionIndicesArray = Object.keys(sectionIndices);
  sectionIndicesArray.map(oldSectionIndex => {
    const sectionIndex = parseInt(oldSectionIndex);
    if (sectionIndex === from) {
      relocatedSectionIndices[to] = null;
    } else if (sectionIndex > 0 && sectionIndex > from && sectionIndex <= to) {
      relocatedSectionIndices[sectionIndex - 1] = null;
    } else if (sectionIndex >= to && sectionIndex < from) {
      relocatedSectionIndices[sectionIndex + 1] = null;
    } else {
      relocatedSectionIndices[sectionIndex] = null;
    }
  });
  return relocatedSectionIndices;
};

export const sectionDataFlatten = (data: SectionData[]): FlattenData => {
  const flattenData: any[] = [];
  const sectionIndices: SectionIndices = {};
  for (let sectionIndex = 0; sectionIndex < data.length; sectionIndex++) {
    const section = data[sectionIndex];
    sectionIndices[flattenData.length] = null;
    flattenData.push(section);
    flattenData.push(...section.data);
  }
  return {
    data: flattenData,
    sectionIndices,
  };
};

export const insertItem = (arr: any[], index: number, newItem: any) => [
  ...arr.slice(0, index),
  newItem,
  ...arr.slice(index),
];
