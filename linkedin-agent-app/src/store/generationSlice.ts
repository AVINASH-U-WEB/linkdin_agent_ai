import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

// ── Types ────────────────────────────────────────────────────────────────────
export interface CompletedDay {
  day: number;
  score: number;
}

export interface GenProgress {
  active: boolean;
  theme: string;
  current_step: string;
  current_day: number;
  total_days: number;
  topics: string[];
  completed_days: CompletedDay[];
  activity_log: string[];
}

export interface GenerationState {
  isGenerating: boolean;
  isMinimized: boolean;
  progress: GenProgress | null;
  // Store the last request payload so we can show info after reload
  lastRequest: {
    theme: string;
    industry: string;
    target_audience: string;
    content_goal: string;
    content_style: string;
  } | null;
}

// ── Initial state ────────────────────────────────────────────────────────────
const initialState: GenerationState = {
  isGenerating: false,
  isMinimized: false,
  progress: null,
  lastRequest: null,
};

// ── Async thunk: check backend progress on startup ────────────────────────────
export const checkGenerationOnMount = createAsyncThunk(
  'generation/checkOnMount',
  async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/workflow/progress`);
    if (!res.ok) return null;
    return (await res.json()) as GenProgress;
  }
);

// ── Slice ────────────────────────────────────────────────────────────────────
const generationSlice = createSlice({
  name: 'generation',
  initialState,
  reducers: {
    startGeneration(state, action: PayloadAction<GenerationState['lastRequest']>) {
      state.isGenerating = true;
      state.isMinimized = false;
      state.progress = null;
      state.lastRequest = action.payload;
    },
    stopGeneration(state) {
      state.isGenerating = false;
      state.isMinimized = false;
      state.progress = null;
    },
    setMinimized(state, action: PayloadAction<boolean>) {
      state.isMinimized = action.payload;
    },
    updateProgress(state, action: PayloadAction<GenProgress>) {
      state.progress = action.payload;
      // If backend says not active, mark generation as done
      if (!action.payload.active && state.isGenerating) {
        state.isGenerating = false;
        state.isMinimized = false;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(checkGenerationOnMount.fulfilled, (state, action) => {
      if (action.payload?.active) {
        // Backend is still running — restore generating UI
        state.isGenerating = true;
        state.progress = action.payload;
      } else {
        // Backend is idle — clear any stale persisted generating state
        state.isGenerating = false;
        state.isMinimized = false;
      }
    });
  },
});

export const {
  startGeneration,
  stopGeneration,
  setMinimized,
  updateProgress,
} = generationSlice.actions;

export default generationSlice.reducer;
