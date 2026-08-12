// Employee Task Management — Kanban board modeled directly on JobsPage (App.jsx), the existing
// job-cards Kanban. Task status transitions are each gated by a specific backend endpoint (accept/
// progress/submit-for-approval/approve/reject) rather than a single generic "set status" call, so
// drag-and-drop here only covers the employee-driven moves; manager decisions (approve/reject) and
// delete happen from the detail modal.
import { useState } from "react";
import { Search, Download, Plus, Trash2, ListChecks, Check, Pencil, Bell, BellOff, MessageCircle, ClipboardList } from "lucide-react";
import { api, ApiError } from "../api";
import { Modal, ConfirmModal, Stamp, statusTone, Rail, Empty, exportCSV, fmtDate, ADMIN_LIKE, isSalesRole, isAssignable, progressColor } from "../ui.jsx";
import { SalesDailyTasksTab } from "./salesDailyTasks.jsx";
import { TaskTemplatesTab } from "./taskTemplates.jsx";
import { CONTENT_STAGES, contentStageSnapshot } from "../contentStagesHelpers";

const TASK_MANAGER_ROLES = ["sales_manager", "ops_manager", "hr"];
const canManageTasks = (role) => ADMIN_LIKE.includes(role) || TASK_MANAGER_ROLES.includes(role);
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const KANBAN_COLS = ["Assigned", "Accepted", "In Progress", "Pending Approval", "Completed", "Rejected"];

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TasksPage({ state, dispatch, role, userId }) {
  const [view, setView] = useState("kanban");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [newTask, setNewTask] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const manager = canManageTasks(role);
  const detail = detailId ? state.tasks.find((t) => t.id === detailId) : null;

  const visible = state.tasks.filter((t) =>
    [t.id, t.title, t.assignedTo, t.department].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase())
  );

  const nameOf = (id) => state.employees.find((e) => e.id === id)?.name || id;
  const initialsOf = (id) => state.employees.find((e) => e.id === id)?.initials || "?";

  const handleDrop = async (col) => {
    setDragOverCol(null);
    const task = visible.find((t) => t.id === draggedId);
    setDraggedId(null);
    if (!task || task.status === col) return;
    const isMine = task.assignedTo === userId;
    try {
      if (col === "Accepted" && task.status === "Assigned" && isMine) await dispatch({ type: "ACCEPT_TASK", id: task.id });
      else if (col === "In Progress" && task.status === "Accepted" && isMine) await dispatch({ type: "PROGRESS_TASK", id: task.id, progressPct: task.progressPct || 10 });
      else if (col === "Pending Approval" && task.status === "In Progress" && isMine) await dispatch({ type: "SUBMIT_TASK_FOR_APPROVAL", id: task.id });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't update the task — please try again.");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="tabbar" style={{ marginBottom: 0, borderBottom: "none" }}>
          <button className={`tab ${view === "kanban" ? "active" : ""}`} onClick={() => setView("kanban")}>Kanban</button>
          <button className={`tab ${view === "table" ? "active" : ""}`} onClick={() => setView("table")}>Table</button>
          <button className={`tab ${view === "todo" ? "active" : ""}`} onClick={() => setView("todo")}>My To-Do List</button>
          {isSalesRole(role) && <button className={`tab ${view === "salesTasks" ? "active" : ""}`} onClick={() => setView("salesTasks")}>Sales Daily Tasks</button>}
          {manager && <button className={`tab ${view === "templates" ? "active" : ""}`} onClick={() => setView("templates")}>Templates</button>}
        </div>
        {!["todo", "salesTasks", "templates"].includes(view) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", maxWidth: 260 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 9, color: "var(--ink-soft)" }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks"
              style={{ width: "100%", border: "1px solid var(--hair)", borderRadius: 8, padding: "7px 12px 7px 34px", fontSize: 13, background: "var(--surface)" }} />
          </div>
          <button className="btn btn-sm" onClick={() => exportCSV("tasks.csv",
            ["Task", "Title", "Assigned To", "Department", "Priority", "Status", "Progress %", "Due Date"],
            visible.map((t) => [t.id, t.title, nameOf(t.assignedTo), t.department || "", t.priority, t.status, t.progressPct, t.dueDate || ""]))}>
            <Download size={13} /> Export
          </button>
          {manager && <button className="btn btn-primary" onClick={() => setNewTask(true)}><Plus size={15} /> New task</button>}
        </div>
        )}
      </div>

      {view === "todo" && <MyToDoListTab state={state} dispatch={dispatch} />}
      {view === "salesTasks" && <SalesDailyTasksTab state={state} dispatch={dispatch} role={role} userId={userId} />}
      {view === "templates" && <TaskTemplatesTab state={state} dispatch={dispatch} role={role} />}

      {view === "table" && (
        <div className="agw-card" style={{ padding: 0 }}>
          {visible.length === 0 ? <Empty icon={ListChecks} text="No tasks yet." /> : (
            <div style={{ overflowX: "auto" }}>
              <table className="agw-table" style={{ minWidth: 820 }}>
                <thead><tr><th>Task</th><th>Title</th><th>Assigned to</th><th>Department</th><th>Priority</th><th>Progress</th><th>Due date</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {visible.map((t) => (
                    <tr key={t.id} onClick={() => setDetailId(t.id)}>
                      <td className="mono">{t.id}</td>
                      <td style={{ maxWidth: 220 }}>{t.title}</td>
                      <td><span className="avatar">{initialsOf(t.assignedTo)}</span> {nameOf(t.assignedTo)}</td>
                      <td>{t.department || "—"}</td>
                      <td>{t.priority}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{t.progressPct}%</td>
                      <td className="mono" style={{ fontSize: 12 }}>{fmtDate(t.dueDate)}</td>
                      <td><Stamp tone={statusTone(t.status)}>{t.status}</Stamp></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {manager && t.status !== "Completed" && (
                          <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => setEditTask(t)}><Pencil size={13} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "kanban" && (
        <div className="board">
          {KANBAN_COLS.map((col) => {
            const colTasks = visible.filter((t) => t.status === col);
            return (
              <div className={`board-col ${dragOverCol === col ? "drag-over" : ""}`} key={col}
                onDragOver={(e) => { e.preventDefault(); if (dragOverCol !== col) setDragOverCol(col); }}
                onDragLeave={() => setDragOverCol((prev) => (prev === col ? null : prev))}
                onDrop={(e) => { e.preventDefault(); handleDrop(col); }}>
                <h4>{col}<span className="pill">{colTasks.length}</span></h4>
                {colTasks.map((t) => (
                  <div className={`job-card ${draggedId === t.id ? "dragging" : ""}`} key={t.id} onClick={() => setDetailId(t.id)}
                    draggable={t.assignedTo === userId && ["Assigned", "Accepted", "In Progress"].includes(t.status)}
                    onDragStart={(e) => { setDraggedId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                    style={{ cursor: "pointer" }} title="Click for full details">
                    <h5 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</h5>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: -4, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.id} · {t.priority}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="pill"><span className="avatar" style={{ marginLeft: -8, marginRight: 6 }}>{initialsOf(t.assignedTo)}</span>{nameOf(t.assignedTo)}</span>
                      {t.progressPct > 0 && <span className="pill">{t.progressPct}%</span>}
                    </div>
                    {col === "Pending Approval" && manager && (
                      <button className="btn btn-sm btn-primary" style={{ marginTop: 8, width: "100%" }} onClick={(e) => { e.stopPropagation(); setDetailId(t.id); }}>Review for approval</button>
                    )}
                  </div>
                ))}
                {colTasks.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: "6px 6px" }}>—</div>}
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <TaskDetailModal task={detail} dispatch={dispatch} role={role} userId={userId} employees={state.employees}
          approvalTypes={state.approvalTypes} manager={manager} onClose={() => setDetailId(null)} />
      )}
      {newTask && <NewTaskModal state={state} dispatch={dispatch} onClose={() => setNewTask(false)} />}
      {editTask && <EditTaskModal task={editTask} state={state} dispatch={dispatch} onClose={() => setEditTask(null)} />}
    </div>
  );
}

function NewTaskModal({ state, dispatch, onClose }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [templateId, setTemplateId] = useState("");
  const activeEmployees = state.employees.filter(isAssignable);
  const department = state.employees.find((e) => e.id === assignedTo)?.dept || "";
  const templates = state.taskTemplates || [];

  const applyTemplate = (id) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.title);
    setDescription(t.description || "");
    setPriority(t.priority || "Normal");
    if (t.dueInDays != null) setDueDate(daysFromNow(t.dueInDays));
  };

  const submit = async () => {
    try {
      await dispatch({ type: "CREATE_TASK", payload: { title: title.trim(), description, priority, dueDate: dueDate || null, assignedTo, department } });
      onClose();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't create the task — please try again.");
    }
  };

  return (
    <Modal title="New task" sub="Assign an employee a task to track through to completion." onClose={onClose} width={520}>
      {templates.length > 0 && (
        <div className="field"><label>Use a template (optional)</label>
          <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">Start from scratch…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.department ? ` — ${t.department}` : ""}</option>)}
          </select>
        </div>
      )}
      <div className="field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Prepare Q3 client renewal list" /></div>
      <div className="field"><label>Description</label><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details / instructions" /></div>
      <div className="row2">
        <div className="field"><label>Assign to</label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Select an employee…</option>
            {activeEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {["Low", "Normal", "High", "Urgent"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="row2">
        <div className="field"><label>Due date</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        <div className="field"><label>Department</label><input value={department} readOnly placeholder="Auto-filled from assignee" /></div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!title.trim() || !assignedTo} onClick={submit}>Assign task</button>
      </div>
    </Modal>
  );
}

function EditTaskModal({ task, state, dispatch, onClose }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [assignedTo, setAssignedTo] = useState(task.assignedTo);
  const [error, setError] = useState("");
  const activeEmployees = state.employees.filter(isAssignable);
  const department = state.employees.find((e) => e.id === assignedTo)?.dept || task.department || "";

  const submit = async () => {
    setError("");
    try {
      await dispatch({ type: "UPDATE_TASK", id: task.id, payload: { title: title.trim(), description, priority, dueDate: dueDate || null, assignedTo, department } });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    }
  };

  return (
    <Modal title={`Edit ${task.id}`} onClose={onClose} width={520}>
      <div className="field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label>Description</label><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="row2">
        <div className="field"><label>Assign to</label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            {activeEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {["Low", "Normal", "High", "Urgent"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Due date</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      {error && <div className="side-note" style={{ borderColor: "#EFC3BC", background: "var(--danger-tint)" }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!title.trim()} onClick={submit}>Save changes</button>
      </div>
    </Modal>
  );
}

// My To-Do List — a user's own private notes/reminders, unrelated to manager-assigned tasks
// above. Every item here belongs to the viewer alone (the backend scopes it that way), so there's
// no visibility/role logic to apply — just add / check off / edit / delete.
function MyToDoListTab({ state, dispatch }) {
  const [newItem, setNewItem] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [removeItem, setRemoveItem] = useState(null);
  const todos = state.todos || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={() => setNewItem(true)}><Plus size={15} /> Add to-do</button>
      </div>
      <div className="agw-card" style={{ padding: 0 }}>
        {todos.length === 0 ? <Empty icon={ListChecks} text="Nothing on your to-do list yet." /> : (
          <div>
            {todos.map((t) => (
              <div key={t.id} className="checklist-item" style={{ padding: "10px 14px" }}>
                <span className={`checkbox ${t.done ? "checked" : ""}`} style={{ cursor: "pointer" }}
                  onClick={() => dispatch({ type: "TOGGLE_TODO", id: t.id, done: !t.done })}>
                  {t.done && <Check size={12} />}
                </span>
                <span style={{ flex: 1, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--ink-soft)" : "var(--ink)" }}>
                  {t.title}
                  {t.reminderEnabled && t.reminderDate && (
                    <span className="pill" style={{ marginLeft: 8 }}><Bell size={11} style={{ verticalAlign: -2, marginRight: 3 }} />{fmtDate(t.reminderDate)}</span>
                  )}
                </span>
                <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => setEditItem(t)}><Pencil size={13} /></button>
                <button className="btn btn-sm btn-ghost" title="Remove" style={{ color: "var(--danger)" }} onClick={() => setRemoveItem(t)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {newItem && <ToDoItemModal dispatch={dispatch} onClose={() => setNewItem(false)} />}
      {editItem && <ToDoItemModal item={editItem} dispatch={dispatch} onClose={() => setEditItem(null)} />}
      {removeItem && (
        <ConfirmModal title="Remove this to-do?" body={removeItem.title} confirmLabel="Remove"
          onConfirm={() => dispatch({ type: "DELETE_TODO", id: removeItem.id })} onClose={() => setRemoveItem(null)} />
      )}
    </div>
  );
}

function ToDoItemModal({ item, dispatch, onClose }) {
  const [title, setTitle] = useState(item?.title || "");
  const [reminderEnabled, setReminderEnabled] = useState(!!item?.reminderEnabled);
  const [reminderDate, setReminderDate] = useState(item?.reminderDate || "");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    try {
      const payload = { title: title.trim(), reminderEnabled, reminderDate: reminderEnabled ? reminderDate || null : null };
      if (item) await dispatch({ type: "UPDATE_TODO", id: item.id, payload });
      else await dispatch({ type: "CREATE_TODO", payload });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    }
  };

  return (
    <Modal title={item ? "Edit to-do" : "Add to-do"} onClose={onClose} width={440}>
      <div className="field"><label>What do you need to do?</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call back the printer vendor" /></div>
      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} />
          {reminderEnabled ? <Bell size={14} /> : <BellOff size={14} />} Remind me
        </label>
      </div>
      {reminderEnabled && (
        <div className="field"><label>Reminder date</label><input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} /></div>
      )}
      {error && <div className="side-note" style={{ borderColor: "#EFC3BC", background: "var(--danger-tint)" }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!title.trim() || (reminderEnabled && !reminderDate)} onClick={submit}>{item ? "Save changes" : "Add to-do"}</button>
      </div>
    </Modal>
  );
}

function TaskDetailModal({ task, dispatch, role, userId, employees, approvalTypes = [], manager, onClose }) {
  const [progressPct, setProgressPct] = useState(task.progressPct);
  const [progressNote, setProgressNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [downloading, setDownloading] = useState(false);

  const isMine = task.assignedTo === userId;
  const myDesignation = employees.find((e) => e.id === userId)?.designation;
  const approverDesignations = approvalTypes.find((t) => t.key === "task_approval")?.approverDesignations || [];
  const canApprove = manager || (myDesignation && approverDesignations.includes(myDesignation));
  const assignee = employees.find((e) => e.id === task.assignedTo);
  const pendingApproval = task.status === "Pending Approval";
  const locked = ["Completed", "Rejected", "Cancelled"].includes(task.status);

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await dispatch({ type: "DELETE_TASK", id: task.id });
      onClose();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't delete — please try again.");
    }
  };

  const run = async (action, extra) => {
    try {
      await dispatch({ type: action, id: task.id, ...extra });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't update the task — please try again.");
    }
  };

  return (
    <>
      <Modal title={task.id} sub={`${task.title} — assigned to ${assignee?.name || task.assignedTo}`} onClose={onClose} width={600}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: -6, marginBottom: 6 }}>
          <button className="btn btn-sm" disabled={downloading} onClick={async () => {
            setDownloading(true);
            try {
              const blob = await api.tasks.downloadPdf(task.id);
              downloadBlob(`Task-${task.id}.pdf`, blob);
            } catch (err) {
              alert(err instanceof ApiError ? err.message : "Couldn't generate the PDF — please try again.");
            } finally {
              setDownloading(false);
            }
          }}><Download size={13} /> {downloading ? "Generating…" : "Download PDF"}</button>
          {ADMIN_LIKE.includes(role) && (
            <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete task</button>
          )}
        </div>
        <Rail steps={["Assigned", "Accepted", "In Progress", "Pending Approval", "Completed"]}
          current={["Completed", "Rejected", "Cancelled"].includes(task.status) ? "Completed" : task.status} />

        {task.description && <p className="modal-sub" style={{ marginTop: 10 }}>{task.description}</p>}

        <div className="row2" style={{ marginTop: 10 }}>
          <div><strong style={{ fontSize: 12, color: "var(--ink-soft)" }}>Priority</strong><div>{task.priority}</div></div>
          <div><strong style={{ fontSize: 12, color: "var(--ink-soft)" }}>Due date</strong><div>{fmtDate(task.dueDate)}</div></div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "var(--ink-soft)" }}>Progress</span><span style={{ fontWeight: 600 }}>{task.progressPct}%</span>
          </div>
          <div style={{ background: "var(--page)", borderRadius: 4, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${task.progressPct}%`, height: "100%", background: "var(--brand)", borderRadius: 4 }} />
          </div>
        </div>

        {task.contentStages?.length > 0 && (
          <ContentStagesTracker task={task} dispatch={dispatch} userId={userId} role={role} manager={manager} />
        )}

        <div style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 13 }}>History</strong>
          <div style={{ marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
            {(!task.statusLog || task.statusLog.length === 0) ? <div className="side-note">No activity recorded yet.</div> : (
              [...task.statusLog].reverse().map((l, i) => {
                const Icon = l.status === "Comment" ? MessageCircle : l.status === "Completed" ? Check : ClipboardList;
                const by = employees.find((e) => e.id === l.by)?.name || l.by || "System";
                return (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i === task.statusLog.length - 1 ? "none" : "1px solid var(--hair)" }}>
                    <Icon size={14} style={{ marginTop: 2, color: "var(--ink-soft)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13 }}>{l.note || l.status}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{by} · {fmtDate(l.at)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input style={{ flex: 1, border: "1px solid var(--hair)", borderRadius: 8, padding: "7px 10px", fontSize: 13 }} placeholder="Add a comment"
              value={newComment} onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newComment.trim()) { dispatch({ type: "ADD_TASK_COMMENT", id: task.id, note: newComment.trim() }); setNewComment(""); } }} />
            <button className="btn btn-sm" onClick={() => { if (newComment.trim()) { dispatch({ type: "ADD_TASK_COMMENT", id: task.id, note: newComment.trim() }); setNewComment(""); } }}>
              <MessageCircle size={13} /> Comment
            </button>
          </div>
        </div>

        {isMine && task.status === "Assigned" && (
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => run("ACCEPT_TASK")}><Check size={14} /> Accept task</button>
          </div>
        )}

        {isMine && ["Accepted", "In Progress"].includes(task.status) && (
          <div className="agw-card" style={{ marginTop: 16 }}>
            <strong style={{ fontSize: 13 }}>Update progress</strong>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Progress ({progressPct}%)</label>
              <input type="range" min={0} max={100} value={progressPct} onChange={(e) => setProgressPct(Number(e.target.value))} />
            </div>
            <div className="field"><label>Note</label><input value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="What did you get done?" /></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => { run("PROGRESS_TASK", { progressPct, note: progressNote }); setProgressNote(""); }}>Save progress</button>
              <button className="btn btn-primary" onClick={() => run("SUBMIT_TASK_FOR_APPROVAL")}>Submit for approval</button>
            </div>
          </div>
        )}

        {pendingApproval && (
          <div className="agw-card" style={{ marginTop: 16, borderColor: "#F2C089", background: "var(--gold-tint)" }}>
            <strong style={{ fontSize: 13 }}>Awaiting approval</strong>
            <p className="modal-sub" style={{ marginBottom: canApprove ? 10 : 0 }}>{assignee?.name || task.assignedTo} submitted this task for sign-off.</p>
            {canApprove && !showReject && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => { run("APPROVE_TASK"); onClose(); }}>Approve</button>
                <button className="btn" style={{ color: "var(--danger)" }} onClick={() => setShowReject(true)}>Reject</button>
              </div>
            )}
            {showReject && (
              <div style={{ marginTop: 10 }}>
                <div className="field"><label>Reason for rejection</label><textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="What needs to be redone?" /></div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => setShowReject(false)}>Back</button>
                  <button className="btn btn-sm btn-primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }} disabled={!rejectReason}
                    onClick={() => { run("REJECT_TASK", { reason: rejectReason }); onClose(); }}>Confirm rejection</button>
                </div>
              </div>
            )}
          </div>
        )}

        {task.status === "Rejected" && task.rejectionReason && (
          <div className="side-note" style={{ borderColor: "#EFC3BC", background: "var(--danger-tint)", marginTop: 14 }}>Rejected: {task.rejectionReason}</div>
        )}
      </Modal>
      {confirmDelete && (
        <ConfirmModal title={`Delete ${task.id}?`} body={`${task.title}. This permanently deletes the task and its history. This can't be undone.`}
          confirmLabel="Delete" onConfirm={handleDelete} onClose={() => setConfirmDelete(false)} />
      )}
    </>
  );
}

// The 9-stage content-production tracker — runs alongside the task's own status above, not
// instead of it. Only present when the task's assignee holds the content_creator role (the
// backend only ever creates task_content_stages rows for those tasks).
function ContentStagesTracker({ task, dispatch, userId, role, manager }) {
  const isMine = task.assignedTo === userId;
  const isAdmin = ADMIN_LIKE.includes(role);
  // Target dates are the content creator's own production schedule — they set them, or a
  // manager/admin can on their behalf.
  const canSetTarget = isMine || manager || isAdmin;
  const snap = contentStageSnapshot(task.contentStages);
  const [savingIdx, setSavingIdx] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [showAdminOverride, setShowAdminOverride] = useState(false);

  const setTarget = async (idx, value) => {
    setSavingIdx(idx);
    try { await dispatch({ type: "SET_CONTENT_STAGE_TARGET", id: task.id, stageIndex: idx, targetDate: value || null }); }
    catch (err) { alert(err instanceof ApiError ? err.message : "Couldn't save that date — please try again."); }
    finally { setSavingIdx(null); }
  };

  const advance = async () => {
    setAdvancing(true);
    try { await dispatch({ type: "ADVANCE_CONTENT_STAGE", id: task.id }); }
    catch (err) { alert(err instanceof ApiError ? err.message : "Couldn't advance — please try again."); }
    finally { setAdvancing(false); }
  };

  return (
    <div className="agw-card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 13 }}>Content production</strong>
        <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{snap.completedCount} of {CONTENT_STAGES.length} stages</span>
      </div>
      <div style={{ background: "var(--page)", borderRadius: 4, height: 8, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ width: `${snap.completionPct}%`, height: "100%", background: progressColor(snap.completionPct), borderRadius: 4 }} />
      </div>
      {snap.stages.map((s) => (
        <div key={s.index} className="checklist-item" style={{ alignItems: "flex-start", padding: "8px 0" }}>
          <span className={`checkbox ${s.status === "done" ? "checked" : ""}`} style={{ marginTop: 2 }}>{s.status === "done" && <Check size={12} />}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: s.status === "current" ? 600 : 400, color: s.status === "locked" ? "var(--ink-soft)" : "var(--ink)" }}>
                {s.index + 1}. {s.name}
              </span>
              {s.status === "current" && isMine && (
                <button className="btn btn-sm btn-primary" disabled={advancing} onClick={advance}>{advancing ? "…" : "Mark done"}</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              {s.status !== "done" && canSetTarget ? (
                <input type="date" value={s.targetDate || ""} disabled={savingIdx === s.index}
                  onChange={(e) => setTarget(s.index, e.target.value)}
                  style={{ fontSize: 11.5, border: "1px solid var(--hair)", borderRadius: 6, padding: "2px 6px" }} />
              ) : s.status !== "done" && s.targetDate ? (
                <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Target: {fmtDate(s.targetDate)}</span>
              ) : null}
              {s.status === "done" && (
                <>
                  <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Done {fmtDate(s.completedAt)}</span>
                  {s.onTime !== null && <Stamp tone={s.onTime ? "success" : "danger"}>{s.onTime ? "On time" : "Late"}</Stamp>}
                </>
              )}
            </div>
          </div>
        </div>
      ))}
      {isAdmin && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowAdminOverride((v) => !v)}>
            {showAdminOverride ? "Hide admin override" : "Admin: override a stage"}
          </button>
          {showAdminOverride && <AdminStageOverride task={task} dispatch={dispatch} />}
        </div>
      )}
    </div>
  );
}

// Admin-only bypass — sets or clears any stage's completion directly, out of the normal
// forward-only sequence, to correct a mistake.
function AdminStageOverride({ task, dispatch }) {
  const [idx, setIdx] = useState(0);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = async (clear) => {
    setBusy(true);
    try {
      await dispatch({
        type: "ADMIN_OVERRIDE_CONTENT_STAGE", id: task.id, stageIndex: Number(idx),
        completedAt: clear ? null : (date || new Date().toISOString().slice(0, 10)),
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't update that stage — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="agw-card" style={{ marginTop: 8 }}>
      <p className="modal-sub" style={{ marginTop: 0 }}>Sets or clears a stage's completion directly, out of the normal sequence.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={idx} onChange={(e) => setIdx(e.target.value)} style={{ fontSize: 12.5 }}>
          {CONTENT_STAGES.map((name, i) => <option key={i} value={i}>{i + 1}. {name}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ fontSize: 12.5 }} />
        <button className="btn btn-sm" disabled={busy} onClick={() => apply(false)}>Set complete</button>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => apply(true)}>Clear</button>
      </div>
    </div>
  );
}
