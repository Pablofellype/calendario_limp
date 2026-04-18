export const state = {
  user: null,
  date: new Date(),
  selectedDate: null,
  tasks: [],
  colaborators: [],
  selectedCollaborators: [],
  selectedCollaboratorIds: [],
  pendingDelete: null,
  pendingComment: null,
  editingTaskId: null,
  selectedRecurrenceDays: [],
  draggedTaskItem: null,
  filterText: '',
  filterCollaborator: '',
  filterStatus: 'all',
  calendarDragTaskId: null,
  calendarView: 'month',

  // Device clocks can be wrong/tampered; use this offset so Date.now()+offset ~= server time.
  serverClockOffsetMs: 0,
  serverClockSyncedAt: 0,
};

export function resetStateForLogout() {
  state.user = null;
  state.colaborators = [];
  state.selectedCollaborators = [];
  state.selectedCollaboratorIds = [];
  state.tasks = [];
  state.pendingDelete = null;
  state.pendingComment = null;
  state.editingTaskId = null;
  state.selectedRecurrenceDays = [];
  state.draggedTaskItem = null;
  state.filterText = '';
  state.filterCollaborator = '';
  state.filterStatus = 'all';
  state.calendarDragTaskId = null;
  state.calendarView = 'month';

  state.serverClockOffsetMs = 0;
  state.serverClockSyncedAt = 0;
}
