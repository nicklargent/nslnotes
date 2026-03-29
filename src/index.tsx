/* @refresh reload */
import { render } from "solid-js/web";
import "./App.css";
import "./editor.css";
import "./hljs-theme.css";
import App from "./App";

render(() => <App />, document.getElementById("root") as HTMLElement);
