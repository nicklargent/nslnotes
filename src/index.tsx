/* @refresh reload */
import { render } from "solid-js/web";
import "./App.css";
import "./editor.css";
import "./hljs-theme.css";
import App from "./App";

const root = document.getElementById("root") as HTMLElement;
document.getElementById("splash")?.remove();
render(() => <App />, root);
