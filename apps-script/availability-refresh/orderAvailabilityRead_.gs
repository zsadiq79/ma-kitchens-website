function orderAvailabilityRead_(body) {
  if (!body || !/^[a-f0-9]{64}$/.test(String(body.menuRevision || '')) ||
      !/^MENU-\d{4}-\d{2}-\d{2}$/.test(String(body.menuCycleId || '')) ||
      body.menuCycleId !== 'MENU-' + body.deliveryDate) throw new Error('INVALID_REQUEST');
  if (mkReleasePhase_() !== 'ACTIVE' || PropertiesService.getScriptProperties().getProperty('ORDER_AUTOMATION_CAPTURE_ENABLED') !== 'true' ||
      !orderRequestBeforeCutoff_(body.deliveryDate,new Date()))
    return {ok:true,status:'CLOSED',menuRevision:body.menuRevision,items:[],checkedAt:new Date().toISOString()};
  const key = 'MK_AVAILABILITY_V3_' + body.menuRevision, cache = CacheService.getScriptCache();
  let cached;
  try { cached = cache.get(key); } catch (_) { /* Cache is an optimisation only. */ }
  if (cached) {
    try {
      const result = JSON.parse(cached);
      if (result.menuCycleId === body.menuCycleId && result.deliveryDate === body.deliveryDate &&
          Date.now()-Date.parse(result.checkedAt) < 5000) return result;
    } catch (_) { /* Rebuild malformed/expired cache entries. */ }
  }
  const book = mkReleaseOpenBook_(CONTROL_TOWER_SPREADSHEET_ID), state = orderRequestReadMenuState_(book);
  if (state.status !== 'ACTIVE' || state.revision !== body.menuRevision || state.cycleId !== body.menuCycleId || state.deliveryDate !== body.deliveryDate)
    return {ok:true,status:'STALE',menuRevision:body.menuRevision,items:[],checkedAt:new Date().toISOString()};
  const live = orderRequestLiveLines_(book,state), lowStock = mkLowStockSettings_(book);
  const items = Object.keys(state.items).map(id => {
    const published = state.items[id], line = live[published.menuLineId];
    let status = 'UNAVAILABLE';
    if (line && line.cycleId === state.cycleId && line.itemCode === published.itemCode &&
        line.priceCents === published.priceCents && line.dishName === published.dishName &&
        line.cookId === published.cookId && line.kitchenName === published.kitchenName &&
        line.menuStatus === 'Available' && line.dishStatus === 'Active' && line.readiness === 'READY') {
      if (mkAvailabilitySoldOut_(line.availabilityStatus) || line.remainingServings <= 0) status = 'SOLD_OUT';
      else if (line.availabilityStatus === 'Available') status = 'AVAILABLE';
    }
    const item = {id:id,status:status};
    if (lowStock.enabled && status === 'AVAILABLE' && Number.isSafeInteger(line.remainingServings) &&
        line.remainingServings > 0 && line.remainingServings <= lowStock.threshold)
      item.lowStockRemaining = line.remainingServings;
    return item;
  });
  const result = {ok:true,status:'OPEN',menuRevision:state.revision,menuCycleId:state.cycleId,
    deliveryDate:state.deliveryDate,checkedAt:new Date().toISOString(),items:items};
  try { cache.put(key,JSON.stringify(result),5); } catch (_) { /* No order write depends on caching. */ }
  return result;
}

