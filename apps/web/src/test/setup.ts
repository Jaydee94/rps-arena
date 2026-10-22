import '@testing-library/jest-dom/vitest';
import { motion } from '../lib/motion';

// Tests run without the reveal countdown unless they switch it on themselves.
motion.countdownBeatMs = 0;
