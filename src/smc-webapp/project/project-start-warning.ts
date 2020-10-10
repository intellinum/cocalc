import { redux } from "../app-framework";

/* Various actions depend on the project running, so this function currently does the following:
    - Checks whether or not the project is running (assuming project state known -- admins don't know).
    - If not running displays an alert and returns false.
    - If running, displays nothing and returns true.

NOTE: We could change this function to *start* a non-running project, or to popup a
"would you like to start the project" dialog.  That's why we make it async.  It's to
give us that UI flexibility later.
*/
export async function ensure_project_running(
  project_id: string,
  what: string
): Promise<boolean> {
  const state = redux
    .getStore("projects")
    ?.getIn(["project_map", project_id, "state", "state"]);
  if (state == null || state == "running" || state == "starting") {
    return true;
  }
  const project_actions = redux.getProjectActions(project_id);
  const result = await project_actions.modal(
    "Start Project?",
    `You must start the project before you can ${what}.  Would you like to start the project?`
  );
  if (result == "ok") {
    redux.getActions("projects").start_project(project_id);
    return true;
  }
  return false;
}
