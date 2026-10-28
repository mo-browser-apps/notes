// Inter Variable, the first family in --font-regular. Imported here rather than with an
// @import in index.css: Tailwind's postcss plugin inlines that @import without rebasing
// its url()s, so the .woff2 files never get emitted and the font silently never loads.
import "@fontsource-variable/inter";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>,
);
