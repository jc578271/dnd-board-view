import {ContextProvider} from 'base-recyclerlistview';

export default class BoardContextProvider extends ContextProvider {
  _map: Map<string, string | number>;
  _uniqueKey: string;
  constructor(key: string) {
    super();
    this._uniqueKey = `board-${key}`;
    this._map = new Map();
  }

  public getUniqueKey = (): string => {
    return this._uniqueKey;
  };
  public save = (key: string, value: string | number): void => {
    this._map.set(key, value);
  };
  public get = (key: string): string | number => {
    return this._map.get(key) || 0;
  };
  public remove = (key: string): void => {
    this._map.delete(key);
  };
}
