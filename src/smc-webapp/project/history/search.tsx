import * as React from "react";
import { debounce } from "lodash";
import { Map } from "immutable";
import { SearchInput } from "../../r_misc";
import { ProjectActions } from "smc-webapp/project_store";
import { TypedMap } from "../../app-framework";

interface Props {
  search?: string;
  actions: ProjectActions;
  selected?: Map<
    string,
    TypedMap<{ event: "open" | "set"; filename?: string }>
  >;
  increment_cursor: Function;
  decrement_cursor: Function;
  reset_cursor: Function;
}

export function LogSearch(props: Props) {
  let mounted = true;

  // [j3] This has to be an anti-pattern...
  React.useEffect(() => {
    return () => {
      mounted = false;
    };
  }, []);

  const open_selected = React.useCallback(
    (_value, info: any): void => {
      let e = props.selected?.get("event");
      if (e == undefined) {
        return;
      }
      switch (e.get("event")) {
        case "open":
          var target = e.get("filename");
          if (target != null) {
            props.actions.open_file({
              path: target,
              foreground: !info.ctrl_down
            });
          }
          break;
        case "set":
          props.actions.set_active_tab("settings");
      }
    },
    [props.selected, props.actions]
  );

  const on_change = React.useCallback(
    debounce((value: string): void => {
      if (!mounted) {
        return;
      }
      props.reset_cursor();
      props.actions.setState({ search: value });
    }, 300),
    [props.reset_cursor, props.actions]
  );

  return (
    <SearchInput
      ref={"box"}
      autoFocus={true}
      autoSelect={true}
      placeholder="Search log..."
      value={props.search}
      on_change={on_change}
      on_submit={open_selected}
      on_up={props.decrement_cursor}
      on_down={props.increment_cursor}
      on_escape={() => props.actions.setState({ search: "" })}
    />
  );
}