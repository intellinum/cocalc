import { project_api, start_project } from "../../frame-editors/generic/client";

export interface NBGraderAPIOptions {
  // Project will try to evaluate/autograde for this many milliseconds;
  // if time is exceeded, all additional problems fail and what we graded
  // so far is returned.
  timeout_ms: number;

  // The *contents* of the student-submitted ipynb file, but with
  // all output deleted (to keep it small).  This is NOT a filename
  // but actual ipynb contents!
  student_ipynb: string;

  // The contents of the instructor version of the ipynb file, but
  // also with any output deleted.   This contains a record of *what*
  // questions were asked and also additional more extensive checks of
  // student solutions.  Again, this is NOT a file name, but ipynb contents!
  instructor_ipynb: string;

  // Preferred directory in which to run grading (e.g., so accessing
  // a data file or auxiliary scripts might work).
  student_path: string;
}

export interface NBGraderAPIResponse {
  output: any; // no clue yet.
}

export async function nbgrader(
  project_id: string,
  opts: NBGraderAPIOptions
): Promise<NBGraderAPIResponse> {
  await start_project(project_id);
  const api = await project_api(project_id);
  return await api.nbgrader(opts);
}

export async function jupyter_stripped(
  project_id: string,
  path: string
): Promise<string> {
  await start_project(project_id);
  const api = await project_api(project_id);
  return await api.jupyter_stripped(path);
}