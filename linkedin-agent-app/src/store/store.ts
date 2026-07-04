import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import storage from 'redux-persist/lib/storage'; // localStorage
import { combineReducers } from '@reduxjs/toolkit';
import generationReducer from './generationSlice';
import calendarReducer from './calendarSlice';

// ── Persist config: only persist generation state (not full calendar) ─────────
const generationPersistConfig = {
  key: 'generation',
  storage,
  whitelist: ['isGenerating', 'isMinimized', 'lastRequest'],
  // NOTE: we do NOT persist 'progress' — it is always re-fetched from backend
};

const rootReducer = combineReducers({
  generation: persistReducer(generationPersistConfig, generationReducer),
  calendar: calendarReducer,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

// ── Type helpers ──────────────────────────────────────────────────────────────
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
