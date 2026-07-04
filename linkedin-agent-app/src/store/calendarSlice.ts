import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

// ── Types ────────────────────────────────────────────────────────────────────
export interface Post {
  scheduled_date: string;
  topic: string;
  draft: string;
  score: number;
  status: string;
  created_at?: string;
}

export interface CalendarState {
  posts: Post[];
  isLoading: boolean;
  lastFetchedAt: number | null;
}

// ── Async thunk ───────────────────────────────────────────────────────────────
export const fetchCalendar = createAsyncThunk(
  'calendar/fetch',
  async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/posts/calendar`);
    if (!res.ok) throw new Error('Calendar fetch failed');
    const data = await res.json();
    return (data.calendar || []) as Post[];
  }
);

export const resetCalendar = createAsyncThunk(
  'calendar/reset',
  async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/posts/calendar/reset`, { method: 'POST' });
    if (!res.ok) throw new Error('Reset failed');
    return [];
  }
);

export const deletePost = createAsyncThunk(
  'calendar/delete',
  async (date: string) => {
    const res = await fetch(`http://localhost:8000/api/posts/${date}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    return date;
  }
);

// ── Slice ─────────────────────────────────────────────────────────────────────
const calendarSlice = createSlice({
  name: 'calendar',
  initialState: {
    posts: [],
    isLoading: false,
    lastFetchedAt: null,
  } as CalendarState,
  reducers: {
    markPublished(state, action: PayloadAction<string>) {
      const post = state.posts.find(p => p.scheduled_date === action.payload);
      if (post) post.status = 'published';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCalendar.pending, (state) => { state.isLoading = true; })
      .addCase(fetchCalendar.fulfilled, (state, action) => {
        state.posts = action.payload;
        state.isLoading = false;
        state.lastFetchedAt = Date.now();
      })
      .addCase(fetchCalendar.rejected, (state) => { state.isLoading = false; })
      .addCase(resetCalendar.fulfilled, (state) => { state.posts = []; state.lastFetchedAt = null; })
      .addCase(deletePost.fulfilled, (state, action) => {
        state.posts = state.posts.filter(p => p.scheduled_date !== action.payload);
      });
  },
});

export const { markPublished } = calendarSlice.actions;
export default calendarSlice.reducer;
