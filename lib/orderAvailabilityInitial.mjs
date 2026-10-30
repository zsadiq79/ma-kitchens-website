export const INITIAL_AVAILABILITY_BUDGET_MS = 200;

// Resolve promptly on cold cache or backend failure. The caller keeps warming
// alive with Next after(); the browser always performs its own immediate check.
export async function initialOrderAvailability(pending, budgetMs = INITIAL_AVAILABILITY_BUDGET_MS) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(pending).catch(() => null),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), budgetMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
