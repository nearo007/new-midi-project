import { Router } from "express";
import type { PlayerService } from "../application/player-service.js";

export function playRouter(player: PlayerService) {
    const router = Router();

    router.post("/play", async (req, res) => {
        const { keyNum } = req.body;
        if (typeof keyNum !== "number" || keyNum < 0 || keyNum > 127) {
            res.status(400).json({ error: "Invalid keyNum. Must be 0-127." });
            return;
        }
        await player.playSequence([{ notes: [keyNum], muted: false }]);
        res.json({ ok: true });
    });

    return router;
}

