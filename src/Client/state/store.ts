/**
 * The hand-rolled store (FR-UI-05, D1): a plain object plus a subscribe/notify pair. Introducing
 * Redux, MobX, or a signals library needs a decision record.
 */
export type Listener<TState> = (state: TState) => void;

export interface Store<TState, TAction> {
  getState(): TState;
  dispatch(action: TAction): void;
  subscribe(listener: Listener<TState>): () => void;
}

export type Reducer<TState, TAction> = (state: TState, action: TAction) => TState;

export function createStore<TState, TAction>(
  reducer: Reducer<TState, TAction>,
  initial: TState,
): Store<TState, TAction> {
  let state = initial;
  const listeners = new Set<Listener<TState>>();

  return {
    getState: () => state,

    dispatch(action) {
      const next = reducer(state, action);
      // Reducers return the same reference when nothing changed; notifying then would re-render
      // for no reason.
      if (next === state) return;
      state = next;
      // Copy: a listener may unsubscribe (or subscribe) while we are notifying.
      for (const listener of [...listeners]) listener(state);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
