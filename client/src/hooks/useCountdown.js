import { useState, useEffect, useRef } from 'react';

export function useCountdown(targetDate) {
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!targetDate) {
      setRemaining(0);
      return;
    }

    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      setRemaining(Math.max(0, diff));
    };

    update();
    intervalRef.current = setInterval(update, 1000);

    return () => clearInterval(intervalRef.current);
  }, [targetDate]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return {
    remaining,
    minutes,
    seconds,
    expired: remaining <= 0 && !!targetDate,
    display: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  };
}
