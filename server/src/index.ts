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

const midi = new JzzAdapter();
await midi.init();

const player = new PlayerService(midi, { ...DEFAULT_CONFIG });

try {
    await midi.autoSelectPort();
    console.log(`MIDI port opened: ${midi.currentPort()}`);
} catch (err) {
    console.warn("No MIDI port available. MIDI output disabled.");
    console.warn(err instanceof Error ? err.message : err);
}

const app = express();
app.use(express.json());

app.use("/api", playRouter(player));
app.use("/api/chord-lab", chordLabRouter(player, midi));
app.use("/api", portRouter(midi, player));

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
});

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

