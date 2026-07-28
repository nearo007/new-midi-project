import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { JzzAdapter } from "./infrastructure/midi/jzz-adapter.js";
import { DEFAULT_CONFIG } from "./infrastructure/config.js";
import { PlayerService } from "./application/player-service.js";
import { playRouter } from "./routes/play.js";
import { chordLabRouter } from "./routes/chord-lab.js";
import { portRouter } from "./routes/port.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDevelopment = process.env.NODE_ENV === "development";
const clientRoot = path.resolve(__dirname, "../../client");
const clientDist = path.join(clientRoot, "dist");

const midi = new JzzAdapter();
await midi.init();

const player = new PlayerService(midi, { ...DEFAULT_CONFIG });

try {
    await midi.autoSelectPort();
    console.log(`MIDI port opened: ${midi.currentPort()}`);
} catch (err) {
    console.warn("No MIDI port available. MIDI output disabled.");
    const midiStatus = midi.status();
    if (midiStatus.error) console.warn(`MIDI backend: ${midiStatus.error}`);
    console.warn(err instanceof Error ? err.message : err);
}

const app = express();
app.use(express.json());

app.use("/api", playRouter(player));
app.use("/api/chord-lab", chordLabRouter(player, midi));
app.use("/api", portRouter(midi, player));

// API routes must never fall through to the SPA entrypoint. This keeps API
// errors machine-readable when a client requests an unknown endpoint.
app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
});

if (isDevelopment) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
        root: clientRoot,
        server: { middlewareMode: true },
        appType: "spa",
    });

    app.use(vite.middlewares);
} else {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
        res.sendFile(path.join(clientDist, "index.html"));
    });
}

app.use(
    (
        err: Error,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
    ) => {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    },
);

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
    console.log(`MIDI Toolbox server running on http://localhost:${PORT}`);
});
