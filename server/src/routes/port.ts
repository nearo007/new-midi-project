import { Router } from "express";
import type { JzzAdapter } from "../infrastructure/midi/jzz-adapter.js";
import type { PlayerService } from "../application/player-service.js";

export function portRouter(midi: JzzAdapter, player: PlayerService) {
    const router = Router();

    router.get("/ports", (req, res) => {
        const ports = midi.listPorts();
        res.json({ ports, current: midi.currentPort() });
    });

    router.post("/set-port", async (req, res) => {
        const { port } = req.body as { port?: string };
        if (!port) {
            res.status(400).json({ error: "port is required" });
            return;
        }
        try {
            player.stopLoop();
            midi.closePort();
            await midi.openPort(port);
            res.json({ ok: true, current: midi.currentPort() });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(400).json({ error: message });
        }
    });

    return router;
}

