Memory recall now learns from council verdicts.

Council and phase-council submissions update the Q-value of memories recalled for the same run, using an exponential moving average over `APPROVE`, `REJECT`, and `CONCERNS` outcomes. Recall scoring boosts high-Q memories, suppresses low-Q memories by default, and propagates a bounded fraction of the reward to recently recalled similar memories.

The new `/swarm memory value-log` command shows recent Q-values, reward outcomes, suppression candidates, and promotion candidates.
