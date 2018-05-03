/*
Convert an *HTML* file (raw url or string content) to printable form.

TODO: refactor with markdown print (?).
*/

import { path_split } from "../generic/misc";

//import { HTML } from 'smc-webapp/r_misc';
const { HTML } = require("smc-webapp/r_misc");

//import ReactDOMServer from "react-dom/server";
const ReactDOMServer = require("react-dom/server");

import { React, Redux, redux } from "../generic/react";

let BLOCKED: boolean | undefined = undefined;

interface PrintOptions {
  value?: string; // string with html; will get processed (e.g., links, math typesetting, etc.) -- meant to go in body
  html?: string; // rendered html string (no post processing done) -- meant to go in body
  src?: string; // if given, just loads that url (default: ''); this is typically a raw URL into a project.
  path?: string; // must be given if src is empty, so can put it in the HTML title and relative links work.
  project_id?: string; // must be given if src is empty
  font_size?: number; // if given (and src not given) will scale body appropriately
}

export function print_html(opts: PrintOptions): string {
  if (!opts.src) opts.src = "";
  const w = window.open(
    opts.src,
    "_blank",
    "menubar=yes,toolbar=no,resizable=yes,scrollbars=yes,height=640,width=800"
  );
  if (!w || w.closed === undefined) {
    if (BLOCKED || BLOCKED === undefined) {
      // no history, or known blocked
      BLOCKED = true;
      return "Popup blocked.  Please unblock popups for this site.";
    } else {
      // definitely doesn't block -- this happens when window already opened and printing.
      return "If you have a window already opened printing a document, close it first.";
    }
  }
  BLOCKED = false;

  if (!opts.src) {
    if (!opts.project_id || !opts.path) {
      return "BUG project_id and path must be specified if src not given.";
    }
    write_content(w, opts);
  }
  print_window(w);
  return "";
}

function print_window(w): void {
  if (w.window.print === null) {
    return;
  }
  const f = () => w.window.print();
  // Wait until the render is (probably) done, then display print dialog.
  w.window.setTimeout(f, 100);
}

function write_content(w, opts: PrintOptions): void {
  if (!opts.path) throw Error("write_content -- path must be defined");
  const split = path_split(opts.path);

  let html: string;
  if (opts.html == null) {
    const props = {
      value: opts.value,
      project_id: opts.project_id,
      file_path: split.head
    };

    const C = React.createElement(
      Redux,
      { redux },
      React.createElement(HTML, props)
    );
    html = ReactDOMServer.renderToStaticMarkup(C);
  } else {
    html = opts.html;
  }
  const title: string = path_split(opts.path).tail;
  html = html_with_deps(html, title, opts.font_size);
  w.document.write(html);
  w.document.close();
}

function html_with_deps(
  html: string,
  title: string,
  font_size?: number
): string {

  let transform = '';
  if (font_size) {
    transform = `transform-origin: top left; transform: scale(${font_size/12});`
  }

  return `\
<html lang="en">
    <head>
        <title>${title}</title>
        <meta name="google" content="notranslate"/>
        <link
            rel         = "stylesheet"
            href        = "https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/3.3.7/css/bootstrap.min.css"
            integrity   = "sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u"
            crossOrigin = "anonymous" />

        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.35.0/codemirror.min.css" />

        <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.9.0/katex.min.css"
            integrity="sha384-TEMocfGvRuD1rIAacqrknm5BQZ7W7uWitoih+jMNFXQIbNl16bO8OZmylH/Vi/Ei"
            crossorigin="anonymous" />

    </head>
    <body style='${transform}; margin:7%'>
        ${html}
    </body>
</html>\
`;
}
