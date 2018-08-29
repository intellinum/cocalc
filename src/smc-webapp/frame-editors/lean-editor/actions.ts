/*
Lean Editor Actions
*/

import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";

import { FrameTree } from "../frame-tree/types";

import { project_api } from "../generic/client";

import { Channel } from "smc-webapp/project/websocket/types";

import { Task, Message } from "./types";

interface LeanEditorState extends CodeEditorState {
  messages: Message[];
  tasks: Task[];
  sync: { hash: number; time: number }; // hash is the hash of last version sync'd to lean, and time is *when*
  syncstring_hash: number; // hash of actual syncstring in client
}

export class Actions extends BaseActions<LeanEditorState> {
  private channel: Channel;

  _init2(): void {
    this.setState({
      messages: [],
      tasks: [],
      sync: { hash: 0, time: 0 },
      syncstring_hash: 0
    });
    if (!this.is_public) {
      this._init_channel();
      this._syncstring.on("change", () => {
        this.setState({
          syncstring_hash: this._syncstring.hash_of_live_version()
        });
      });
    } else {
      this._init_value();
    }
  }

  async _init_channel(): Promise<void> {
    this.channel = await (await project_api(this.project_id)).lean(this.path);
    this.channel.on("data", x => {
      console.log(this.path, "channel got: ", JSON.stringify(x));
      if (typeof x === "object") {
        if (x.messages !== undefined) {
          this.setState({ messages: x.messages });
        }
        if (x.tasks !== undefined) {
          this.setState({ tasks: x.tasks });
        }
        if (x.sync !== undefined) {
          this.setState({ sync: x.sync });
        }
      }
    });
  }

  _raw_default_frame_tree(): FrameTree {
    if (this.is_public) {
      return { type: "cm" };
    } else {
      return {
        direction: "col",
        type: "node",
        first: {
          type: "lean-cm"
        },
        second: {
          type: "lean-info"
        }
      };
    }
  }
}
