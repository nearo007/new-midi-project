import { Router } from "express";
import type { PlayerService } from "../application/player-service.js";

export function playRouter(player: PlayerService) {
    const router = Router();

    router.post("/play", async (req, res) => {
        const { keyNum, velocity = 100 } = req.body;
        if (typeof keyNum !== "number" || keyNum < 0 || keyNum > 127) {
            res.status(400).json({ error: "Invalid keyNum. Must be 0-127." });
            return;
        }
        if (typeof velocity !== "number" || !Number.isInteger(velocity) || velocity < 1 || velocity > 127) {
            res.status(400).json({ error: "Invalid velocity. Must be an integer from 1-127." });
            return;
        }
        await player.playSequence([{ notes: [keyNum], muted: false, velocity }]);
        res.json({ ok: true });
    });

    return router;
}
