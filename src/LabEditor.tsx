import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Plus, Trash, X } from "@phosphor-icons/react";
import type { Lab, Requirement, Task } from "../shared/types";

interface LabEditorProps {
  lab?: Lab;
  onClose: () => void;
  onSave: (lab: Lab) => Promise<void>;
}

const newTask = (number: number): Task => ({
  id: crypto.randomUUID(),
  title: `Task ${number}`,
  description: "",
  maxMarks: 10,
  requirements: [],
});

function pakistanDateValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() + 5 * 60 * 60_000).toISOString().slice(0, 16);
}

export function LabEditor({ lab, onClose, onSave }: LabEditorProps) {
  const [draft, setDraft] = useState<Lab>(() =>
    lab
      ? structuredClone(lab)
      : {
          id: "",
          title: "",
          description: "",
          dueDate: "",
          totalMarks: 30,
          published: false,
          tasks: [newTask(1), newTask(2), newTask(3)],
        },
  );
  const [dueDate, setDueDate] = useState(() => pakistanDateValue(lab?.dueDate));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedTask, setSelectedTask] = useState(0);
  const activeTask = Math.min(selectedTask, draft.tasks.length - 1);
  const dialogRef = useRef<HTMLFormElement>(null);
  const headingId = useId();
  const deadlineId = useId();
  const totalMarks = draft.tasks.reduce(
    (total, task) =>
      total + (Number.isFinite(task.maxMarks) ? task.maxMarks : 0),
    0,
  );

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (error) dialogRef.current?.querySelector(".error")?.scrollIntoView({ block: "nearest" });
  }, [error]);

  function updateTask(taskId: string, changes: Partial<Task>) {
    setDraft((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId ? { ...task, ...changes } : task,
      ),
    }));
  }

  function updateRequirement(
    taskId: string,
    ruleId: string,
    changes: Partial<Requirement>,
  ) {
    setDraft((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              requirements: task.requirements.map((rule) =>
                rule.id === ruleId ? { ...rule, ...changes } : rule,
              ),
            }
          : task,
      ),
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const date = new Date(`${dueDate}+05:00`);
    if (!draft.title.trim() || (dueDate && !Number.isFinite(date.getTime()))) {
      setError("Enter a lab title. Set a valid deadline or leave it empty.");
      return;
    }
    if (
      !draft.tasks.length ||
      draft.tasks.length > 20 ||
      !Number.isFinite(totalMarks) ||
      draft.tasks.some(
        (task) =>
          !task.title.trim() ||
          !Number.isFinite(task.maxMarks) ||
          task.maxMarks < 0.5 ||
          task.maxMarks > 1000,
      )
    ) {
      setSelectedTask(Math.max(0, draft.tasks.findIndex((task) => !task.title.trim() || !Number.isFinite(task.maxMarks) || task.maxMarks < 0.5 || task.maxMarks > 1000)));
      setError(
        "Use 1–20 tasks, each with a title and maximum marks between 0.5 and 1,000.",
      );
      return;
    }
    if (
      draft.title.trim().length > 120 ||
      draft.description.length > 8000 ||
      draft.tasks.some(
        (task) =>
          task.title.trim().length > 120 || task.description.length > 8000,
      )
    ) {
      setSelectedTask(Math.max(0, draft.tasks.findIndex((task) => task.title.trim().length > 120 || task.description.length > 8000)));
      setError(
        "Keep lab and task titles within 120 characters and descriptions within 8,000 characters.",
      );
      return;
    }
    if (
      draft.tasks.some(
        (task) =>
          task.requirements.length > 80 ||
          task.requirements.some(
            (rule) =>
              !rule.label.trim() ||
              rule.label.trim().length > 200 ||
              !rule.value.trim() ||
              rule.value.trim().length > 500 ||
              (rule.type === "attribute" &&
                (!rule.attribute?.trim() ||
                  rule.attribute.trim().length > 100)),
          ),
      )
    ) {
      const invalidTask = draft.tasks.findIndex((task) => task.requirements.length > 80 || task.requirements.some((rule) => !rule.label.trim() || rule.label.trim().length > 200 || !rule.value.trim() || rule.value.trim().length > 500 || (rule.type === "attribute" && (!rule.attribute?.trim() || rule.attribute.trim().length > 100))));
      setSelectedTask(invalidTask);
      setError(
        `Task ${invalidTask + 1}: open Automatic checks and complete or remove incomplete checks. Use at most 80 checks; labels up to 200 characters, values up to 500, and attribute names up to 100.`,
      );
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        dueDate: dueDate ? date.toISOString() : "",
        totalMarks,
        tasks: draft.tasks.map((task) => ({
          ...task,
          title: task.title.trim(),
          description: task.description.trim(),
          requirements: task.requirements.map((rule) => ({
            ...rule,
            label: rule.label.trim(),
            value: rule.value.trim(),
            attribute:
              rule.type === "attribute" ? rule.attribute!.trim() : undefined,
          })),
        })),
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the lab. Your changes are still here.",
      );
    } finally {
      setSaving(false);
    }
  }

  const busy = saving;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        ref={dialogRef}
        className="modal lab-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-busy={busy}
        onSubmit={save}
        noValidate
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!busy) onClose();
          }
          if (event.key === "Tab") {
            const controls = Array.from(
              dialogRef.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
              ) ?? [],
            ).filter((control) => control.getClientRects().length > 0);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="modal-head">
          <div>
            <span className="pill">Lab management</span>
            <h2 id={headingId}>{lab ? "Edit lab" : "Create a lab"}</h2>
          </div>
          <button
            className="icon-btn"
            type="button"
            aria-label="Close lab editor"
            disabled={busy}
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        <div className="modal-body">
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            <div className="lab-basics">
              <label className="field">
                Lab title
                <input maxLength={120} value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. Lab 3 — Forms and tables" />
              </label>
              <div className="field">
                <label htmlFor={deadlineId}>Deadline (optional · Pakistan time)</label>
                <input id={deadlineId} type="datetime-local" value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)} />
              </div>
            </div>
            <details className="lab-extra">
              <summary>Overview (optional)</summary>
              <label className="field">Overview
                <textarea maxLength={8000} rows={3} value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="A short introduction for students." />
              </label>

            </details>
            <div className="lab-task-heading"><h3>Tasks</h3></div>
            <div className="lab-task-switcher" role="group" aria-label="Choose a task to edit">
              {draft.tasks.map((task, index) => <button key={task.id} type="button"
                className="lab-task-tab" aria-pressed={activeTask === index} aria-controls={task.id}
                onClick={() => setSelectedTask(index)}>Task {index + 1}<span>{task.maxMarks} marks</span></button>)}
              <button type="button" className="lab-task-tab lab-task-add" disabled={draft.tasks.length >= 20}
                onClick={() => {
                  setSelectedTask(draft.tasks.length);
                  setDraft((current) => ({ ...current, tasks: [...current.tasks, newTask(current.tasks.length + 1)] }));
                }}><Plus size={18} /> Add task</button>
            </div>
            {draft.tasks.map((task, index) => (
              <fieldset key={task.id} id={task.id} hidden={activeTask !== index} className="task-editor lab-task-content">
                <legend>Task {index + 1}</legend>
                <div className="fields-2">
                  <label className="field">
                    Task title
                    <input
                      required
                      maxLength={120}
                      value={task.title}
                      onChange={(event) =>
                        updateTask(task.id, { title: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Maximum marks
                    <input
                      required
                      type="number"
                      min="0.5"
                      max="1000"
                      step="any"
                      value={task.maxMarks}
                      onChange={(event) =>
                        updateTask(task.id, {
                          maxMarks: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  Task instructions
                  <textarea
                    rows={6}
                    maxLength={8000}
                    value={task.description}
                    onChange={(event) =>
                      updateTask(task.id, { description: event.target.value })
                    }
                    placeholder="Describe the exercise and the files students should include."
                  />
                </label>
                <details className="lab-checks">
                  <summary>Automatic checks (optional) <span>{task.requirements.length} checks</span></summary>
                <p className="muted">
                  Check actual HTML elements, attributes, page text, or project
                  filenames. Use CSS selectors for element and attribute rules.
                </p>
                {task.requirements.map((rule, ruleIndex) => (
                  <div key={rule.id} className="task-editor">
                    <div className="fields-2">
                      <label className="field">
                        Requirement {ruleIndex + 1}
                        <input
                          required
                          maxLength={200}
                          value={rule.label}
                          onChange={(event) =>
                            updateRequirement(task.id, rule.id, {
                              label: event.target.value,
                            })
                          }
                          placeholder="e.g. Heading level 1 present"
                        />
                      </label>
                      <label className="field">
                        Check type
                        <select
                          value={rule.type}
                          onChange={(event) =>
                            updateRequirement(task.id, rule.id, {
                              type: event.target.value as Requirement["type"],
                            })
                          }
                        >
                          <option value="tag">HTML element</option>
                          <option value="attribute">HTML attribute</option>
                          <option value="text">Page text</option>
                          <option value="file">Project file</option>
                        </select>
                      </label>
                    </div>
                    <div className="fields-2">
                      <label className="field">
                        {rule.type === "file"
                          ? "Required filename"
                          : rule.type === "text"
                            ? "Required text"
                            : "CSS selector"}
                        <input
                          required
                          maxLength={500}
                          value={rule.value}
                          onChange={(event) =>
                            updateRequirement(task.id, rule.id, {
                              value: event.target.value,
                            })
                          }
                          placeholder={
                            rule.type === "file"
                              ? "lab1.html"
                              : rule.type === "text"
                                ? "Welcome to Web Engineering"
                                : "h1"
                          }
                        />
                      </label>
                      {rule.type === "attribute" ? (
                        <label className="field">
                          Attribute name
                          <input
                            required
                            maxLength={100}
                            value={rule.attribute ?? ""}
                            onChange={(event) =>
                              updateRequirement(task.id, rule.id, {
                                attribute: event.target.value,
                              })
                            }
                            placeholder="e.g. title"
                          />
                        </label>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        updateTask(task.id, {
                          requirements: task.requirements.filter(
                            (item) => item.id !== rule.id,
                          ),
                        })
                      }
                    >
                      <Trash size={16} />
                      Remove requirement
                    </button>
                  </div>
                ))}
                {!task.requirements.length ? (
                  <p className="muted">
                    No automatic checks. You can review and mark this task manually.
                  </p>
                ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={task.requirements.length >= 80}
                    onClick={() => {
                      if (task.requirements.length < 80)
                        updateTask(task.id, {
                          requirements: [
                            ...task.requirements,
                            {
                              id: crypto.randomUUID(),
                              label: "",
                              type: "tag",
                              value: "",
                            },
                          ],
                        });
                    }}
                  >
                    <Plus size={18} />
                    Add requirement
                  </button>
                </details>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={draft.tasks.length === 1}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        tasks: current.tasks.filter(
                          (item) => item.id !== task.id,
                        ),
                      }))
                    }
                  >
                    <Trash size={18} />
                    Remove task
                  </button>
              </fieldset>
            ))}
            <label className="field lab-publish">
              <span>
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      published: event.target.checked,
                    }))
                  }
                />{" "}
                Publish to students
              </span>
            </label>
          </fieldset>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="modal-foot">
          <span className="muted">
            {draft.tasks.length} tasks · {totalMarks} marks
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {saving
              ? "Saving…"
              : draft.published
                ? "Save and publish"
                : "Save draft"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LabEditor;
