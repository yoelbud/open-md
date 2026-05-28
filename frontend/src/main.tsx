/* @refresh reload */
import { render } from "solid-js/web";
import { App } from "./App";
import { initMarkdownEngine } from "./ipc/runtime";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

void initMarkdownEngine().then(() => {
  render(() => <App />, root);
});
