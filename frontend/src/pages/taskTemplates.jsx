// Task Templates — admin-managed reusable starting points for the existing "New Task" form.
// Visible to managers (read-only list), Create/Edit/Delete restricted to admin. Purely a client-
// side pre-fill convenience — using a template still creates a normal task through the existing
// POST /tasks pipeline; nothing here touches tasks/task_status_log or the approval flow.
import { useState } from "react";
import { Plus, Pencil, Trash2, Files } from "lucide-react";
import { ApiError } from "../api";
import { Modal, Empty, useConfirm, ADMIN_LIKE } from "../ui.jsx";

export function TaskTemplatesTab({ state, dispatch, role }) {
  const isAdmin = ADMIN_LIKE.includes(role);
  const [newTemplate, setNewTemplate] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const confirm = useConfirm();
  const templates = state.taskTemplates || [];

  const remove = async (t) => {
    if (await confirm({ title: `Delete "${t.name}"?`, body: "This removes the template — tasks already created from it are unaffected.", confirmLabel: "Delete" })) {
      try { await dispatch({ type: "DELETE_TASK_TEMPLATE", id: t.id }); }
      catch (err) { alert(err instanceof ApiError ? err.message : "Couldn't delete — please try again."); }
    }
  };

  return (
    <div>
      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <button className="btn btn-primary" onClick={() => setNewTemplate(true)}><Plus size={15} /> New template</button>
        </div>
      )}
      <div className="agw-card" style={{ padding: 0 }}>
        {templates.length === 0 ? <Empty icon={Files} text="No task templates yet — create one to speed up repeat tasks for a department." /> : (
          <div style={{ overflowX: "auto" }}>
            <table className="agw-table">
              <thead><tr><th>Name</th><th>Department</th><th>Priority</th><th>Task title</th><th>Due (days)</th>{isAdmin && <th></th>}</tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.department || "—"}</td>
                    <td>{t.priority}</td>
                    <td style={{ maxWidth: 260 }}>{t.title}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{t.dueInDays ?? "—"}</td>
                    {isAdmin && (
                      <td style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-sm btn-ghost" title="Edit" onClick={() => setEditTemplate(t)}><Pencil size={13} /></button>
                        <button className="btn btn-sm btn-ghost" title="Delete" style={{ color: "var(--danger)" }} onClick={() => remove(t)}><Trash2 size={13} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {newTemplate && <TemplateModal dispatch={dispatch} onClose={() => setNewTemplate(false)} />}
      {editTemplate && <TemplateModal template={editTemplate} dispatch={dispatch} onClose={() => setEditTemplate(null)} />}
    </div>
  );
}

function TemplateModal({ template, dispatch, onClose }) {
  const [name, setName] = useState(template?.name || "");
  const [department, setDepartment] = useState(template?.department || "");
  const [title, setTitle] = useState(template?.title || "");
  const [description, setDescription] = useState(template?.description || "");
  const [priority, setPriority] = useState(template?.priority || "Normal");
  const [dueInDays, setDueInDays] = useState(template?.dueInDays ?? "");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    const payload = { name: name.trim(), department: department.trim() || null, title: title.trim(), description, priority, dueInDays: dueInDays === "" ? null : Number(dueInDays) };
    try {
      if (template) await dispatch({ type: "UPDATE_TASK_TEMPLATE", id: template.id, payload });
      else await dispatch({ type: "CREATE_TASK_TEMPLATE", payload });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save — please try again.");
    }
  };

  return (
    <Modal title={template ? "Edit template" : "New task template"} sub="A reusable starting point for New Task — the manager can still edit anything before creating." onClose={onClose} width={520}>
      <div className="row2">
        <div className="field"><label>Template name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Invoice Preparation" /></div>
        <div className="field"><label>Department</label><input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Accounts" /></div>
      </div>
      <div className="field"><label>Task title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Prepare monthly invoices" /></div>
      <div className="field"><label>Description</label><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details / instructions" /></div>
      <div className="row2">
        <div className="field"><label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {["Low", "Normal", "High", "Urgent"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="field"><label>Due in (days, optional)</label><input type="number" min={0} value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} placeholder="e.g. 3" /></div>
      </div>
      {error && <div className="side-note" style={{ borderColor: "#EFC3BC", background: "var(--danger-tint)" }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!name.trim() || !title.trim()} onClick={submit}>{template ? "Save changes" : "Create template"}</button>
      </div>
    </Modal>
  );
}
