const CONTROL_TOWER_SPREADSHEET_ID =
  '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4';

const WEEKLY_MENU_SHEET = 'Weekly Menu';
const DISHES_SHEET = 'Dishes';
const CUSTOMER_INTAKE_SHEET = 'Customer Intake';
const CUSTOMERS_SHEET = 'Customers';
const ORDERS_SHEET = 'Orders';
const ORDER_ITEMS_SHEET = 'Order Items';
const MENU_CONFIG_SHEET = 'Menu Config';
const DELIVERY_WINDOW = '4–10 PM';
const PAYMENT_PAYID = '0420 246 023';

// Only messages sent from this WhatsApp number can place an order
// on behalf of another customer. Store in international digits format.
const OWNER_WHATSAPP_PHONE = '61420306705';

const MAX_FLOW_MEALS = 20;
const MAX_WHATSAPP_LIST_ROWS = 10;

// Standard WhatsApp interactive lists allow up to 10 rows.
// Kitchen-first navigation keeps each list within that limit.
const WHATSAPP_KITCHEN_PAGE_SIZE = 8;
const WHATSAPP_DISH_PAGE_SIZE = 7;

// Pricing, minimum-order and delivery rules are read from the
// Control Tower -> Menu Config tab. No live pricing rule is hard-coded here.

const CART_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_TTL_SECONDS = 21600; // 6 hours


/* =========================================================
   WEBHOOK VERIFICATION
   ========================================================= */

function doGet(e) {
  const verifyToken =
    PropertiesService.getScriptProperties()
      .getProperty('WHATSAPP_VERIFY_TOKEN');

  const mode = e.parameter['hub.mode'];
  const token = e.parameter['hub.verify_token'];
  const challenge = e.parameter['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    return ContentService
      .createTextOutput(challenge)
      .setMimeType(ContentService.MimeType.TEXT);
  }

  return ContentService
    .createTextOutput('Verification failed')
    .setMimeType(ContentService.MimeType.TEXT);
}


/* =========================================================
   MAIN WEBHOOK
   ========================================================= */

/* Replace ONLY Code.gs doPost(e) with this complete function. Do not add a
 * second doPost. Other Code.gs functions, menu/ordering and Routific stay intact.
 */
function doPost(e) {
  const text = value => ContentService.createTextOutput(value).setMimeType(ContentService.MimeType.TEXT);
  const json = value => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  try {
    const action = e && e.parameter && e.parameter.action;
    if (action === 'menu') return handleMenuApiRequest_(e);
    if (FW.actions.indexOf(action) >= 0) return handleFeedbackWebApiRequest_(e, action);
    const raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 1100000) return json({ ok: false });
    let payload = JSON.parse(raw), verified = false;
    if (action === 'whatsapp_verified') {
      if (!fwObject_(payload) || typeof payload.secret !== 'string' || payload.secret !== fwConfig_('FLOW_MENU_API_SECRET') || !fwObject_(payload.payload)) return json({ ok: false });
      payload = payload.payload; verified = true;
    }
    // Preserve the existing authenticated Routific routing and its handler.
    if (payload && (Object.prototype.hasOwnProperty.call(payload, 'controlTowerSecret') || payload.payload?.type === 'order.status_updated')) return handleRoutificWebhook_(e);
    if (!verified && fwProps_().getProperty('WHATSAPP_REQUIRE_VERIFIED_FORWARD') === 'true') return json({ ok: false });
    let failed = false;
    // Process every entry/change, not just the first callback envelope.
    (Array.isArray(payload.entry) ? payload.entry : []).forEach(entry => {
      (Array.isArray(entry.changes) ? entry.changes : []).forEach(change => {
        const value = change.value || {};
        (Array.isArray(value.messages) ? value.messages : []).forEach(message => {
          try { processIncomingMessageOnce_(message); } catch (_) { failed = true; }
        });
        (Array.isArray(value.statuses) ? value.statuses : []).forEach(status => {
          try {
            // Do not fabricate receipt times. V2 receipts only use verified events.
            if (verified) { recordWhatsAppStatus_(status); updateWhatsAppLogFromStatus_(status); }
            else if (fwProps_().getProperty('FEEDBACK_V2_WRITES_ENABLED') !== 'true') {
              recordWhatsAppStatus_(status); updateWhatsAppLogFromStatus_(status); // Legacy history only; V2 is disabled.
            }
          } catch (_) { failed = true; }
        });
      });
    });
    return verified ? json({ ok: !failed }) : text('EVENT_RECEIVED');
  } catch (_) { return json({ ok: false }); } // Never log exceptions/payloads/tokens.
}



/* =========================================================
   PERSIST RECENT WHATSAPP DELIVERY STATUSES
   Script Properties only. No spreadsheet writes.
   ========================================================= */

function recordWhatsAppStatus_(status) {
  const props =
    PropertiesService.getScriptProperties();

  const key =
    'WHATSAPP_RECENT_STATUS_LOG';

  let entries = [];

  try {
    const existing =
      props.getProperty(key);

    if (existing) {
      const parsed =
        JSON.parse(existing);

      if (Array.isArray(parsed)) {
        entries = parsed;
      }
    }
  } catch (err) {
    entries = [];
  }

  const errors =
    Array.isArray(status && status.errors)
      ? status.errors.map(error => ({
          code:
            error && error.code !== undefined
              ? String(error.code)
              : '',
          title:
            error && error.title
              ? String(error.title)
              : '',
          message:
            error && error.message
              ? String(error.message)
              : '',
          details:
            error &&
            error.error_data &&
            error.error_data.details
              ? String(
                  error.error_data.details
                )
              : ''
        }))
      : [];

  entries.push({
    receivedAt:
      new Date().toISOString(),
    messageId:
      String(
        status && status.id
          ? status.id
          : ''
      ),
    status:
      String(
        status && status.status
          ? status.status
          : ''
      ),
    recipientId:
      String(
        status && status.recipient_id
          ? status.recipient_id
          : ''
      ),
    timestamp:
      String(
        status && status.timestamp
          ? status.timestamp
          : ''
      ),
    errors: errors
  });

  if (entries.length > 50) {
    entries =
      entries.slice(
        entries.length - 50
      );
  }

  props.setProperty(
    key,
    JSON.stringify(entries)
  );
}


function getRecentWhatsAppStatuses() {
  const props =
    PropertiesService.getScriptProperties();

  const raw =
    props.getProperty(
      'WHATSAPP_RECENT_STATUS_LOG'
    );

  let entries = [];

  if (raw) {
    try {
      const parsed =
        JSON.parse(raw);

      if (Array.isArray(parsed)) {
        entries = parsed;
      }
    } catch (err) {
      entries = [];
    }
  }

  const result = {
    count: entries.length,
    statuses: entries
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/* =========================================================
   IDEMPOTENCY — PROCESS EACH WHATSAPP MESSAGE ONLY ONCE
   ========================================================= */

function processIncomingMessageOnce_(message) {
  const messageId = String(message.id || '').trim();

  // If Meta ever sends an event without an ID, process it normally.
  if (!messageId) {
    handleIncomingWhatsAppMessage_(message);
    return;
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'WA_MSG_' + messageId;
  const lock = LockService.getScriptLock();

  lock.waitLock(5000);

  try {
    if (cache.get(cacheKey)) {
      console.log(
        'Duplicate WhatsApp message ignored: ' +
        messageId
      );
      return;
    }

    // Mark it before processing so two simultaneous deliveries cannot both run.
    cache.put(
      cacheKey,
      'PROCESSING',
      IDEMPOTENCY_TTL_SECONDS
    );
  } finally {
    lock.releaseLock();
  }

  try {
    handleIncomingWhatsAppMessage_(message);

    cache.put(
      cacheKey,
      'DONE',
      IDEMPOTENCY_TTL_SECONDS
    );
  } catch (err) {
    // Allow a genuine retry if our processing failed.
    cache.remove(cacheKey);
    throw err;
  }
}


/* =========================================================
   INCOMING WHATSAPP MESSAGE ROUTER
   ========================================================= */

function handleIncomingWhatsAppMessage_(message) {
  const sender = String(message.from || '');
  const messageType = String(message.type || '');

  if (!sender) {
    return;
  }

  /*
   * WhatsApp template quick-reply buttons arrive as a
   * "button" message with message.button.payload.
   * Give the feedback workflow first refusal.
   */
  if (messageType === 'button') {
    const payload = String(
      message.button?.payload || ''
    ).trim();

    if (
      typeof handleFeedbackTemplateReply_ === 'function' &&
      handleFeedbackTemplateReply_(
        sender,
        payload,
        message
      )
    ) {
      return;
    }

    return;
  }

  if (messageType === 'text') {
    const text = String(
      message.text?.body || ''
    ).trim();

    /*
     * Give the feedback workflow first refusal for free-text
     * comments only when that customer has a live pending
     * feedback-comment state.
     */
    if (
      typeof handleFeedbackTextReply_ === 'function' &&
      handleFeedbackTextReply_(
        sender,
        text,
        message
      )
    ) {
      return;
    }

    if (text.toUpperCase() === 'START ORDER') {
      startNewOrder_(sender);
      return;
    }

    // During checkout, ordinary text is used for the delivery address,
    // postcode and (for a new customer) customer name.
    if (handleCheckoutTextReply_(sender, text)) {
      return;
    }

    return;
  }

  if (messageType !== 'interactive') {
    return;
  }

  const interactive = message.interactive || {};
  const interactiveType = String(interactive.type || '');

  if (interactiveType === 'list_reply') {
    const reply = interactive.list_reply || {};
    const replyId = String(reply.id || '');

    if (
      typeof handleFeedbackInteractiveReply_ === 'function' &&
      handleFeedbackInteractiveReply_(
        sender,
        replyId,
        message
      )
    ) {
      return;
    }

    handleMenuListReply_(sender, replyId);
    return;
  }

  if (interactiveType === 'button_reply') {
    const reply = interactive.button_reply || {};
    const buttonId = String(reply.id || '');

    if (
      typeof handleFeedbackInteractiveReply_ === 'function' &&
      handleFeedbackInteractiveReply_(
        sender,
        buttonId,
        message
      )
    ) {
      return;
    }

    handleButtonReply_(sender, buttonId);
  }
}


/* =========================================================
   START A NEW ORDER
   ========================================================= */

function startNewOrder_(recipient) {
  const menu = buildActiveMenu_();

  if (
    menu.status !== 'ACTIVE' ||
    !menu.meals ||
    menu.meals.length === 0
  ) {
    sendTextMessage_(
      recipient,
      'Sorry, there is no active Ma Kitchens menu available right now.'
    );
    return;
  }

  resetCart_(
    recipient,
    menu.menuCycleId || ''
  );

  sendKitchenList_(recipient, menu, 0);
}


/* =========================================================
   SEND LIVE MENU — KITCHEN FIRST
   ========================================================= */

function sendMealList_(recipient, menuOverride) {
  sendKitchenList_(
    recipient,
    menuOverride || buildActiveMenu_(),
    0
  );
}


function getMenuKitchens_(menu) {
  const kitchens = [];
  const kitchenIndexByName = {};

  (menu.meals || []).forEach(meal => {
    const kitchenName = String(
      meal.kitchenName || 'Ma Kitchens'
    ).trim();

    if (kitchenIndexByName[kitchenName] === undefined) {
      kitchenIndexByName[kitchenName] = kitchens.length;

      kitchens.push({
        name: kitchenName,
        meals: []
      });
    }

    kitchens[
      kitchenIndexByName[kitchenName]
    ].meals.push(meal);
  });

  return kitchens;
}


function sendKitchenList_(recipient, menuOverride, pageIndex) {
  const menu = menuOverride || buildActiveMenu_();

  if (
    menu.status !== 'ACTIVE' ||
    !menu.meals ||
    menu.meals.length === 0
  ) {
    sendTextMessage_(
      recipient,
      'Sorry, there is no active Ma Kitchens menu available right now.'
    );
    return;
  }

  const kitchens = getMenuKitchens_(menu);

  if (kitchens.length === 0) {
    sendTextMessage_(
      recipient,
      'Sorry, there are no kitchens available on the current menu.'
    );
    return;
  }

  const pageCount = Math.ceil(
    kitchens.length / WHATSAPP_KITCHEN_PAGE_SIZE
  );

  let page = Number(pageIndex || 0);

  page = Math.max(
    0,
    Math.min(page, pageCount - 1)
  );

  const start =
    page * WHATSAPP_KITCHEN_PAGE_SIZE;

  const end = Math.min(
    start + WHATSAPP_KITCHEN_PAGE_SIZE,
    kitchens.length
  );

  const rows = [];

  for (let i = start; i < end; i++) {
    const kitchen = kitchens[i];

    rows.push({
      id: 'KITCHEN|' + i,
      title: truncateText_(
        kitchen.name,
        24
      ),
      description: truncateText_(
        kitchen.meals.length +
          (kitchen.meals.length === 1
            ? ' dish available'
            : ' dishes available'),
        72
      )
    });
  }

  if (page > 0) {
    rows.push({
      id: 'KPAGE|' + (page - 1),
      title: '← Previous kitchens',
      description: 'See earlier kitchens'
    });
  }

  if (page < pageCount - 1) {
    rows.push({
      id: 'KPAGE|' + (page + 1),
      title: 'More kitchens →',
      description: 'See more kitchens'
    });
  }

  const rules = getOrderingRules_();

  let menuIntro =
    'Choose a kitchen to see its dishes.';

  if (rules.discountPercent > 0) {
    menuIntro +=
      ' Current offer: ' +
      formatPercent_(rules.discountPercent) +
      '% off menu prices.';
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: 'Ma Kitchens'
      },
      body: {
        text: menuIntro
      },
      footer: {
        text:
          'Delivery: ' +
          (menu.deliveryDateDisplay || '')
      },
      action: {
        button: 'Choose a kitchen',
        sections: [
          {
            title:
              pageCount > 1
                ? 'Kitchens ' +
                  (page + 1) +
                  ' of ' +
                  pageCount
                : 'Available kitchens',
            rows: rows
          }
        ]
      }
    }
  };

  sendWhatsAppPayload_(payload);
}


function sendKitchenDishList_(
  recipient,
  menuOverride,
  kitchenIndex,
  pageIndex
) {
  const menu = menuOverride || buildActiveMenu_();
  const kitchens = getMenuKitchens_(menu);
  const index = Number(kitchenIndex);

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= kitchens.length
  ) {
    sendTextMessage_(
      recipient,
      'That kitchen is no longer available. Send START ORDER to refresh the menu.'
    );
    return;
  }

  const kitchen = kitchens[index];
  const meals = kitchen.meals || [];

  if (meals.length === 0) {
    sendTextMessage_(
      recipient,
      'There are no dishes currently available from that kitchen.'
    );
    return;
  }

  const pageCount = Math.ceil(
    meals.length / WHATSAPP_DISH_PAGE_SIZE
  );

  let page = Number(pageIndex || 0);

  page = Math.max(
    0,
    Math.min(page, pageCount - 1)
  );

  const start =
    page * WHATSAPP_DISH_PAGE_SIZE;

  const end = Math.min(
    start + WHATSAPP_DISH_PAGE_SIZE,
    meals.length
  );

  const rows = [];

  for (let i = start; i < end; i++) {
    const meal = meals[i];

    rows.push({
      id: 'DISH|' + meal.itemCode,
      title: truncateText_(
        meal.dishName,
        24
      ),
      description: truncateText_(
        [
          meal.portion,
          meal.priceDisplay
        ]
          .filter(Boolean)
          .join(' · '),
        72
      )
    });
  }

  // 7 dishes + Previous + Next + Back = maximum 10 rows.
  if (page > 0) {
    rows.push({
      id:
        'DPAGE|' +
        index +
        '|' +
        (page - 1),
      title: '← Previous dishes',
      description: 'See earlier dishes'
    });
  }

  if (page < pageCount - 1) {
    rows.push({
      id:
        'DPAGE|' +
        index +
        '|' +
        (page + 1),
      title: 'More dishes →',
      description: 'See more dishes'
    });
  }

  rows.push({
    id: 'BACK_KITCHENS|0',
    title: '← Back to kitchens',
    description: 'Choose another kitchen'
  });

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: truncateText_(
          kitchen.name,
          60
        )
      },
      body: {
        text:
          'Choose a dish. After selecting it, choose the quantity.'
      },
      footer: {
        text:
          'Delivery: ' +
          (menu.deliveryDateDisplay || '')
      },
      action: {
        button: 'Choose a dish',
        sections: [
          {
            title:
              pageCount > 1
                ? 'Dishes ' +
                  (page + 1) +
                  ' of ' +
                  pageCount
                : 'Available dishes',
            rows: rows
          }
        ]
      }
    }
  };

  sendWhatsAppPayload_(payload);
}


function handleMenuListReply_(recipient, replyId) {
  const id = String(replyId || '');

  if (!id) {
    return;
  }

  const menu = buildActiveMenu_();

  if (
    menu.status !== 'ACTIVE' ||
    !menu.meals ||
    menu.meals.length === 0
  ) {
    sendTextMessage_(
      recipient,
      'Sorry, there is no active Ma Kitchens menu available right now.'
    );
    return;
  }

  ensureCartForMenu_(
    recipient,
    menu.menuCycleId || ''
  );

  if (id.indexOf('KITCHEN|') === 0) {
    const parts = id.split('|');

    if (parts.length !== 2) {
      return;
    }

    sendKitchenDishList_(
      recipient,
      menu,
      Number(parts[1]),
      0
    );
    return;
  }

  if (id.indexOf('KPAGE|') === 0) {
    const parts = id.split('|');

    if (parts.length !== 2) {
      return;
    }

    sendKitchenList_(
      recipient,
      menu,
      Number(parts[1])
    );
    return;
  }

  if (id.indexOf('DPAGE|') === 0) {
    const parts = id.split('|');

    if (parts.length !== 3) {
      return;
    }

    sendKitchenDishList_(
      recipient,
      menu,
      Number(parts[1]),
      Number(parts[2])
    );
    return;
  }

  if (id.indexOf('BACK_KITCHENS|') === 0) {
    sendKitchenList_(
      recipient,
      menu,
      0
    );
    return;
  }

  if (id.indexOf('DISH|') === 0) {
    handleMealSelection_(
      recipient,
      id.substring('DISH|'.length)
    );
    return;
  }

  // Backwards compatibility for older list messages that used raw Item Codes.
  handleMealSelection_(
    recipient,
    id
  );
}


/* =========================================================
   CUSTOMER SELECTED A DISH
   ========================================================= */

function handleMealSelection_(recipient, itemCode) {
  const menu = buildActiveMenu_();

  const meal = menu.meals?.find(
    candidate =>
      String(candidate.itemCode) ===
      String(itemCode)
  );

  if (!meal) {
    sendTextMessage_(
      recipient,
      'Sorry, that meal is no longer available. Send START ORDER to refresh the menu.'
    );
    return;
  }

  ensureCartForMenu_(
    recipient,
    menu.menuCycleId || ''
  );

  sendQuantityPrompt_(
    recipient,
    meal
  );
}

/* =========================================================
   QUANTITY BUTTONS
   ========================================================= */

function sendQuantityPrompt_(recipient, meal) {
  const bodyText =
    meal.dishName +
    ' selected.\n\n' +
    (meal.portion
      ? meal.portion + ' · '
      : '') +
    meal.priceDisplay +
    '\n\nHow many would you like?';

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: bodyText
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id:
                'QTY|' +
                meal.itemCode +
                '|1',
              title: '1'
            }
          },
          {
            type: 'reply',
            reply: {
              id:
                'QTY|' +
                meal.itemCode +
                '|2',
              title: '2'
            }
          },
          {
            type: 'reply',
            reply: {
              id:
                'QTY|' +
                meal.itemCode +
                '|3',
              title: '3'
            }
          }
        ]
      }
    }
  };

  sendWhatsAppPayload_(payload);
}


/* =========================================================
   BUTTON REPLY HANDLER
   ========================================================= */

function handleButtonReply_(recipient, buttonId) {
  if (buttonId.indexOf('QTY|') === 0) {
    const parts = buttonId.split('|');

    if (parts.length !== 3) {
      return;
    }

    const itemCode = parts[1];
    const quantity = Number(parts[2]);

    if (![1, 2, 3].includes(quantity)) {
      return;
    }

    const menu = buildActiveMenu_();
    const meal = menu.meals?.find(
      candidate =>
        String(candidate.itemCode) ===
        String(itemCode)
    );

    if (!meal) {
      sendTextMessage_(
        recipient,
        'Sorry, that meal is no longer available. Send START ORDER to refresh the menu.'
      );
      return;
    }

    ensureCartForMenu_(
      recipient,
      menu.menuCycleId || ''
    );

    const cart = addItemToCart_(
      recipient,
      itemCode,
      quantity,
      menu.menuCycleId || ''
    );

    sendCartNextAction_(
      recipient,
      meal,
      quantity,
      cart,
      menu
    );

    return;
  }

  if (buttonId === 'ADD_ANOTHER') {
    sendMealList_(recipient);
    return;
  }

  if (buttonId === 'CHECKOUT') {
    sendCheckoutReview_(recipient);
    return;
  }

  if (buttonId === 'CHECKOUT_CONTINUE') {
    beginCheckout_(recipient);
    return;
  }

  if (buttonId === 'ORDER_FOR_MYSELF') {
    beginCheckoutForCustomer_(recipient, recipient);
    return;
  }

  if (buttonId === 'ORDER_FOR_SOMEONE_ELSE') {
    beginOrderForSomeoneElse_(recipient);
    return;
  }

  if (buttonId === 'USE_SAVED_ADDRESS') {
    useSavedAddress_(recipient);
    return;
  }

  if (
    buttonId === 'ENTER_NEW_ADDRESS' ||
    buttonId === 'CHANGE_ADDRESS'
  ) {
    promptForDeliveryAddress_(recipient);
    return;
  }

  if (buttonId === 'PLACE_ORDER') {
    placeOrder_(recipient);
    return;
  }

  if (buttonId === 'CANCEL_ORDER') {
    clearCart_(recipient);

    sendTextMessage_(
      recipient,
      'Your current order has been cleared. Send START ORDER whenever you are ready to begin again.'
    );
  }
}


/* =========================================================
   CART RESPONSE AFTER QUANTITY
   ========================================================= */

function sendCartNextAction_(
  recipient,
  meal,
  quantityAdded,
  cart,
  menu
) {
  const summary = buildCartSummary_(
    cart,
    menu
  );

  // The quote carries the exact Menu Config rules used for this interaction.
  const quote = calculateCartQuote_(
    cart,
    menu
  );

  const itemsRemaining =
    Math.max(
      0,
      quote.minimumOrderItems - quote.totalQty
    );

  let minimumOrderMessage = '';

  if (itemsRemaining > 0) {
    minimumOrderMessage =
      'Minimum order: ' +
      quote.totalQty +
      ' of ' +
      quote.minimumOrderItems +
      ' items selected. Add ' +
      itemsRemaining +
      (
        itemsRemaining === 1
          ? ' more item.'
          : ' more items.'
      );
  } else {
    minimumOrderMessage =
      'Minimum order reached ✓';
  }

  let pricingLines =
    '\n\nFood total: ' +
    formatMoney_(quote.listSubtotal);

  if (quote.discountPercent > 0) {
    pricingLines =
      '\n\nMenu price: ' +
      formatMoney_(quote.listSubtotal) +
      '\n' +
      formatPercent_(quote.discountPercent) +
      '% discount: -' +
      formatMoney_(quote.discount) +
      '\nFood total after discount: ' +
      formatMoney_(quote.discountedSubtotal);
  }

  pricingLines +=
    '\nDelivery: ' +
    (
      quote.deliveryFee === 0
        ? 'FREE'
        : formatMoney_(quote.deliveryFee)
    ) +
    '\nCurrent total: ' +
    formatMoney_(quote.total);

  let deliveryProgressMessage = '';

  if (quote.freeDeliveryThreshold > 0) {
    if (quote.freeDelivery) {
      deliveryProgressMessage =
        '\nFREE delivery unlocked 🎉';
    } else {
      const amountToFreeDelivery =
        roundMoney_(
          Math.max(
            0,
            quote.freeDeliveryThreshold -
              quote.freeDeliveryBasisAmount
          )
        );

      deliveryProgressMessage =
        '\nAdd ' +
        formatMoney_(amountToFreeDelivery) +
        ' more in ' +
        (
          quote.freeDeliveryBasis ===
          'Post-discount food value'
            ? 'discounted food value'
            : 'food value'
        ) +
        ' to unlock FREE delivery.';
    }
  }

  const body =
    'Added: ' +
    quantityAdded +
    ' × ' +
    meal.dishName +
    '\n\nYour order so far:\n' +
    summary +
    pricingLines +
    '\n\n' +
    minimumOrderMessage +
    deliveryProgressMessage +
    '\n\nWhat would you like to do next?';

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: body
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'ADD_ANOTHER',
              title: 'Add another meal'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'CHECKOUT',
              title: 'Checkout'
            }
          }
        ]
      }
    }
  };

  sendWhatsAppPayload_(payload);
}


/* =========================================================
   CHECKOUT REVIEW
   ========================================================= */

function sendCheckoutReview_(recipient) {
  const cart = getCart_(recipient);

  if (!cart || !cart.items || Object.keys(cart.items).length === 0) {
    sendTextMessage_(
      recipient,
      'Your cart is empty. Send START ORDER to begin.'
    );
    return;
  }

  const menu = buildActiveMenu_();

  if (
    cart.menuCycleId &&
    menu.menuCycleId &&
    cart.menuCycleId !== menu.menuCycleId
  ) {
    clearCart_(recipient);

    sendTextMessage_(
      recipient,
      'The active menu has changed, so I cleared the old cart. Send START ORDER to begin with the latest menu.'
    );
    return;
  }

  const quote = calculateCartQuote_(
    cart,
    menu
  );

  if (quote.totalQty < quote.minimumOrderItems) {
    sendTextMessage_(
      recipient,
      'Minimum order is ' +
        quote.minimumOrderItems +
        ' items. Your cart currently has ' +
        quote.totalQty +
        ' item(s). Please add more items before checkout.'
    );

    sendKitchenList_(
      recipient,
      menu,
      0
    );
    return;
  }

  const summary = buildCartSummary_(
    cart,
    menu
  );

  const body =
    'Review your order:\n\n' +
    summary +
    '\n\nNext we will collect your delivery address and show the final total and delivery charge.';

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: body
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'CHECKOUT_CONTINUE',
              title: 'Continue checkout'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'ADD_ANOTHER',
              title: 'Add another meal'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'CANCEL_ORDER',
              title: 'Cancel order'
            }
          }
        ]
      }
    }
  };

  sendWhatsAppPayload_(payload);
}

/* =========================================================
   CHECKOUT — CUSTOMER + DELIVERY ADDRESS + FINAL REVIEW
   ========================================================= */

function beginCheckout_(recipient) {
  const cart = getCart_(recipient);

  if (!cart || !cart.items || Object.keys(cart.items).length === 0) {
    sendTextMessage_(
      recipient,
      'Your cart is empty. Send START ORDER to begin.'
    );
    return;
  }

  // The owner gets one extra checkout choice. No other WhatsApp sender can
  // activate proxy ordering, even if they somehow send the button ID.
  if (isOwnerRecipient_(recipient)) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: 'Who is this order for?'
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'ORDER_FOR_MYSELF',
                title: 'My order'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'ORDER_FOR_SOMEONE_ELSE',
                title: 'Someone else'
              }
            }
          ]
        }
      }
    };

    sendWhatsAppPayload_(payload);
    return;
  }

  beginCheckoutForCustomer_(recipient, recipient);
}


function beginOrderForSomeoneElse_(recipient) {
  if (!isOwnerRecipient_(recipient)) {
    // Security guard: ordinary customers cannot enter proxy-order mode.
    return;
  }

  const cart = getCart_(recipient);

  if (!cart) {
    sendTextMessage_(
      recipient,
      'Your cart has expired. Send START ORDER to begin again.'
    );
    return;
  }

  cart.orderForSomeoneElse = true;
  cart.orderCustomerPhone = '';
  cart.customerId = '';
  cart.customerName = '';
  cart.savedAddress = '';
  cart.savedPostcode = '';
  cart.deliveryAddress = '';
  cart.postcode = '';
  cart.checkoutState = 'AWAITING_PROXY_PHONE';
  saveCart_(recipient, cart);

  sendTextMessage_(
    recipient,
    'Please reply with the customer’s mobile number for this order. Example: 0412 345 678'
  );
}


function beginCheckoutForCustomer_(recipient, customerPhone) {
  const cart = getCart_(recipient);

  if (!cart) {
    sendTextMessage_(
      recipient,
      'Your cart has expired. Send START ORDER to begin again.'
    );
    return;
  }

  const targetPhone = normalisePhoneDigits_(customerPhone || recipient);

  // Selecting "My order" explicitly removes any proxy-order details that
  // might remain from an earlier checkout attempt in the same cart.
  if (targetPhone === normalisePhoneDigits_(recipient)) {
    cart.orderForSomeoneElse = false;
    cart.orderCustomerPhone = targetPhone;
  }

  const customer = findCustomerByPhone_(targetPhone);

  if (customer) {
    cart.customerId = customer.customerId || '';
    cart.customerName = customer.name || '';
    cart.savedAddress = customer.defaultDeliveryAddress || '';
    cart.savedPostcode = customer.postcode || '';
    saveCart_(recipient, cart);

    if (cart.savedAddress) {
      sendSavedAddressChoice_(recipient, cart.savedAddress);
      return;
    }
  }

  saveCart_(recipient, cart);
  promptForDeliveryAddress_(recipient);
}

function sendSavedAddressChoice_(recipient, address) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text:
          'We have this delivery address saved for you:\n\n' +
          address +
          '\n\nWould you like to use it for this order?'
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'USE_SAVED_ADDRESS',
              title: 'Use saved address'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'ENTER_NEW_ADDRESS',
              title: 'New address'
            }
          }
        ]
      }
    }
  };

  sendWhatsAppPayload_(payload);
}


function promptForDeliveryAddress_(recipient) {
  const cart = getCart_(recipient);

  if (!cart) {
    sendTextMessage_(
      recipient,
      'Your cart has expired. Send START ORDER to begin again.'
    );
    return;
  }

  cart.checkoutState = 'AWAITING_ADDRESS';
  delete cart.pendingAddress;
  saveCart_(recipient, cart);

  sendTextMessage_(
    recipient,
    'Please reply with your full delivery address, including suburb and 4-digit postcode.\n\nExample: 12 Smith Street, Greenacre NSW 2190'
  );
}


function useSavedAddress_(recipient) {
  const cart = getCart_(recipient);

  if (!cart || !cart.savedAddress) {
    promptForDeliveryAddress_(recipient);
    return;
  }

  cart.deliveryAddress = cart.savedAddress;
  cart.postcode =
    extractPostcode_(cart.savedAddress) ||
    cart.savedPostcode ||
    '';
  cart.checkoutState = '';
  saveCart_(recipient, cart);

  continueAfterAddress_(recipient, cart);
}


function handleCheckoutTextReply_(recipient, text) {
  const cart = getCart_(recipient);

  if (!cart || !cart.checkoutState) {
    return false;
  }

  if (cart.checkoutState === 'AWAITING_PROXY_PHONE') {
    if (!isOwnerRecipient_(recipient)) {
      return false;
    }

    const phone = normalisePhoneDigits_(text);

    if (!isValidAustralianMobile_(phone)) {
      sendTextMessage_(
        recipient,
        'Please reply with a valid Australian mobile number, for example 0412 345 678.'
      );
      return true;
    }

    cart.orderForSomeoneElse = true;
    cart.orderCustomerPhone = phone;
    cart.customerId = '';
    cart.customerName = '';
    cart.savedAddress = '';
    cart.savedPostcode = '';
    cart.deliveryAddress = '';
    cart.postcode = '';
    cart.checkoutState = '';
    saveCart_(recipient, cart);

    beginCheckoutForCustomer_(recipient, phone);
    return true;
  }

  if (cart.checkoutState === 'AWAITING_ADDRESS') {
    if (!text || text.length < 8) {
      sendTextMessage_(
        recipient,
        'Please send the full delivery address, including suburb and postcode.'
      );
      return true;
    }

    const postcode = extractPostcode_(text);

    if (!postcode) {
      cart.pendingAddress = text;
      cart.checkoutState = 'AWAITING_POSTCODE';
      saveCart_(recipient, cart);

      sendTextMessage_(
        recipient,
        'Thanks. Please reply with the 4-digit postcode for that address.'
      );
      return true;
    }

    cart.deliveryAddress = text;
    cart.postcode = postcode;
    cart.checkoutState = '';
    delete cart.pendingAddress;
    saveCart_(recipient, cart);

    continueAfterAddress_(recipient, cart);
    return true;
  }

  if (cart.checkoutState === 'AWAITING_POSTCODE') {
    const postcodeMatch = String(text || '').match(/\b\d{4}\b/);

    if (!postcodeMatch) {
      sendTextMessage_(
        recipient,
        'Please reply with a valid 4-digit Australian postcode.'
      );
      return true;
    }

    const postcode = postcodeMatch[0];
    const baseAddress = String(cart.pendingAddress || '').trim();

    cart.deliveryAddress =
      baseAddress +
      (baseAddress ? ', ' : '') +
      postcode;
    cart.postcode = postcode;
    cart.checkoutState = '';
    delete cart.pendingAddress;
    saveCart_(recipient, cart);

    continueAfterAddress_(recipient, cart);
    return true;
  }

  if (cart.checkoutState === 'AWAITING_NAME') {
    const name = String(text || '').trim();

    if (name.length < 2) {
      sendTextMessage_(
        recipient,
        'Please reply with the name you would like us to put on the order.'
      );
      return true;
    }

    cart.customerName = truncateText_(name, 80);
    cart.checkoutState = '';
    saveCart_(recipient, cart);

    sendFinalConfirmation_(recipient);
    return true;
  }

  return false;
}


function continueAfterAddress_(recipient, cartOverride) {
  const cart = cartOverride || getCart_(recipient);

  if (!cart) {
    return;
  }

  if (!cart.customerName) {
    const customer = findCustomerByPhone_(getOrderCustomerPhone_(recipient, cart));

    if (customer) {
      cart.customerId = customer.customerId || '';
      cart.customerName = customer.name || '';
      saveCart_(recipient, cart);
    }
  }

  if (!cart.customerName) {
    cart.checkoutState = 'AWAITING_NAME';
    saveCart_(recipient, cart);

    sendTextMessage_(
      recipient,
      'What name should we put on the order? Please reply with your name.'
    );
    return;
  }

  sendFinalConfirmation_(recipient);
}


function sendFinalConfirmation_(recipient) {
  const cart = getCart_(recipient);

  if (!cart || !cart.deliveryAddress) {
    promptForDeliveryAddress_(recipient);
    return;
  }

  const menu = buildActiveMenu_();

  if (
    menu.status !== 'ACTIVE' ||
    (cart.menuCycleId && menu.menuCycleId !== cart.menuCycleId)
  ) {
    clearCart_(recipient);
    sendTextMessage_(
      recipient,
      'The active menu has changed, so the old cart was cleared. Send START ORDER to begin with the latest menu.'
    );
    return;
  }

  const availabilityError = validateCartAvailability_(cart, menu);

  if (availabilityError) {
    sendTextMessage_(recipient, availabilityError);
    return;
  }

  const quote = calculateCartQuote_(
    cart,
    menu
  );

  if (quote.totalQty < quote.minimumOrderItems) {
    sendTextMessage_(
      recipient,
      'Minimum order is ' +
        quote.minimumOrderItems +
        ' items. Your cart currently has ' +
        quote.totalQty +
        ' item(s). Please add more items before checkout.'
    );

    sendKitchenList_(
      recipient,
      menu,
      0
    );
    return;
  }

  const orderCustomerPhone = getOrderCustomerPhone_(recipient, cart);
  const customer = findCustomerByPhone_(orderCustomerPhone);
  const customerId = customer ? customer.customerId : '';

  cart.quote = quote;
  cart.customerId = customerId || cart.customerId || '';

  if (customer && customer.name) {
    cart.customerName = customer.name;
  }

  saveCart_(recipient, cart);

  let pricingLines =
    '\n\nFood total: ' +
    formatMoney_(quote.listSubtotal);

  if (quote.discountPercent > 0) {
    pricingLines =
      '\n\nMenu price: ' +
      formatMoney_(quote.listSubtotal) +
      '\n' +
      formatPercent_(quote.discountPercent) +
      '% discount: -' +
      formatMoney_(quote.discount) +
      '\nFood total after discount: ' +
      formatMoney_(quote.discountedSubtotal);
  }

  let body =
    'Final order review:\n\n' +
    buildCartSummary_(cart, menu) +
    '\n\nDelivery: ' +
    (menu.deliveryDateDisplay || '') +
    ', ' + DELIVERY_WINDOW +
    '\nAddress: ' + cart.deliveryAddress +
    pricingLines +
    '\nDelivery: ' +
    (quote.deliveryFee === 0
      ? 'FREE'
      : formatMoney_(quote.deliveryFee)) +
    '\nTotal: ' + formatMoney_(quote.total);

  if (cart.orderForSomeoneElse) {
    body =
      'ORDER FOR: ' + cart.customerName +
      ' (' + formatPhoneForDisplay_(orderCustomerPhone) + ')\n\n' +
      body;
  }

  if (
    quote.freeDelivery &&
    quote.freeDeliveryThreshold > 0
  ) {
    body +=
      '\n\nFree delivery applied because the ' +
      (
        quote.freeDeliveryBasis ===
        'Post-discount food value'
          ? 'post-discount'
          : 'pre-discount'
      ) +
      ' food value reached ' +
      formatMoney_(quote.freeDeliveryThreshold) +
      '.';
  }

  body +=
    '\n\nTap Place order to submit this order.';

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'PLACE_ORDER',
              title: 'Place order'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'CHANGE_ADDRESS',
              title: 'Change address'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'CANCEL_ORDER',
              title: 'Cancel order'
            }
          }
        ]
      }
    }
  };

  sendWhatsAppPayload_(payload);
}

function placeOrder_(recipient) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  let orderCreated = false;
  let result = null;
  let quote = null;
  let menu = null;
  let cart = null;

  try {
    cart = getCart_(recipient);

    if (!cart || !cart.items || Object.keys(cart.items).length === 0) {
      sendTextMessage_(
        recipient,
        'Your cart is empty or has expired. Send START ORDER to begin again.'
      );
      return;
    }

    if (!cart.deliveryAddress || !cart.customerName) {
      beginCheckout_(recipient);
      return;
    }

    menu = buildActiveMenu_();

    if (
      menu.status !== 'ACTIVE' ||
      (cart.menuCycleId && menu.menuCycleId !== cart.menuCycleId)
    ) {
      clearCart_(recipient);
      sendTextMessage_(
        recipient,
        'The active menu has changed, so the old cart was cleared. Send START ORDER to begin again.'
      );
      return;
    }

    const availabilityError = validateCartAvailability_(cart, menu);

    if (availabilityError) {
      sendTextMessage_(recipient, availabilityError);
      return;
    }

    const orderCustomerPhone = getOrderCustomerPhone_(recipient, cart);
    let customer = findCustomerByPhone_(orderCustomerPhone);

    if (!customer) {
      createWhatsAppCustomerIntake_(
        orderCustomerPhone,
        cart.customerName,
        cart.postcode || extractPostcode_(cart.deliveryAddress) || ''
      );

      SpreadsheetApp.flush();

      // Registry/Customers are formula-driven, so allow time to recalculate.
      for (let i = 0; i < 12 && !customer; i++) {
        Utilities.sleep(300);
        SpreadsheetApp.flush();
        customer = findCustomerByPhone_(orderCustomerPhone);
      }
    }

    if (!customer || !customer.customerId) {
      throw new Error(
        'Could not create or locate the customer record.'
      );
    }

    updateCustomerDefaultAddress_(
      customer.customerId,
      cart.deliveryAddress
    );

    quote = calculateCartQuote_(
      cart,
      menu
    );

    if (quote.totalQty < quote.minimumOrderItems) {
      sendTextMessage_(
        recipient,
        'Minimum order is ' +
          quote.minimumOrderItems +
          ' items. Please add more items before placing the order.'
      );
      return;
    }

    result = createControlTowerOrder_(
      recipient,
      cart,
      menu,
      customer,
      quote
    );

    orderCreated = true;
    clearCart_(recipient);

  } catch (err) {
    console.error(
      'Place order error: ' +
      (err.stack || err)
    );

    if (!orderCreated) {
      sendTextMessage_(
        recipient,
        'Sorry, we could not submit the order just now. Your cart is still saved. Please try Place order again, or message Ma Kitchens for help.'
      );
    }

    return;

  } finally {
    lock.releaseLock();
  }

  // The order is already safely stored at this point. A WhatsApp delivery
  // problem must never cause the customer to create a duplicate order.
  try {
    sendTextMessage_(
      recipient,
      'Order received ✅\n\n' +
      (cart.orderForSomeoneElse
        ? 'Customer: ' + cart.customerName + ' (' +
          formatPhoneForDisplay_(getOrderCustomerPhone_(recipient, cart)) + ')\n'
        : '') +
      'Order: ' + result.orderId + '\n' +
      'Order Details\n' +
      buildCartSummary_(cart, menu) +
      '\n\nTotal: ' + formatMoney_(quote.total) + '\n' +
      'Delivery: ' + (menu.deliveryDateDisplay || '') +
      ', ' + DELIVERY_WINDOW + '\n' +
      'Address: ' + cart.deliveryAddress +
      '\n\nPayment to be made through PayID as per the information below:' +
      '\nPayID: ' + PAYMENT_PAYID +
      '\nReference: ' + result.orderId +
      '\n\nWhen you make the payment, please send us payment confirmation via WhatsApp on 0420 246 023 (a screenshot or your banking app confirmation message) so we can match it to your order.'
    );
  } catch (sendErr) {
    console.error(
      'Order ' + result.orderId +
      ' was created successfully, but the WhatsApp confirmation failed: ' +
      (sendErr.stack || sendErr)
    );
  }
}

function validateCartAvailability_(cart, menu) {
  const mealMap = {};

  (menu.meals || []).forEach(meal => {
    mealMap[String(meal.itemCode)] = meal;
  });

  for (const itemCode of Object.keys(cart.items || {})) {
    const quantity = Number(cart.items[itemCode] || 0);
    const meal = mealMap[itemCode];

    if (!meal) {
      return (
        'One of the meals in your cart is no longer available. Please tap Add another meal or send START ORDER to refresh the menu.'
      );
    }

    if (quantity > Number(meal.remainingServings || 0)) {
      return (
        meal.dishName +
        ' now has only ' +
        meal.remainingServings +
        ' serving(s) available. Please send START ORDER to start a fresh order with the latest availability.'
      );
    }
  }

  return '';
}


function calculateCartQuote_(cart, menu) {
  const mealMap = {};

  (menu.meals || []).forEach(meal => {
    mealMap[String(meal.itemCode)] = meal;
  });

  let listSubtotal = 0;
  let totalQty = 0;

  Object.keys(cart.items || {}).forEach(itemCode => {
    const quantity = Number(cart.items[itemCode] || 0);
    const meal = mealMap[itemCode];

    if (!meal || quantity <= 0) {
      return;
    }

    const listPrice = Number(meal.price || 0);

    listSubtotal +=
      listPrice *
      quantity;

    totalQty += quantity;
  });

  listSubtotal = roundMoney_(listSubtotal);

  // Freeze pricing rules at the start of the cart so a Menu Config
  // change cannot alter a customer's price halfway through checkout.
  const rules =
    cart && cart.pricingRules
      ? validateOrderingRulesObject_(cart.pricingRules)
      : getOrderingRules_();

  const discountRate =
    rules.discountPercent / 100;

  const discountedSubtotal = roundMoney_(
    listSubtotal *
    (1 - discountRate)
  );

  const discount = roundMoney_(
    listSubtotal -
    discountedSubtotal
  );

  const freeDeliveryBasisAmount =
    rules.freeDeliveryBasis ===
    'Post-discount food value'
      ? discountedSubtotal
      : listSubtotal;

  // A threshold of 0 explicitly disables the free-delivery promotion.
  const freeDelivery =
    rules.freeDeliveryThreshold > 0 &&
    freeDeliveryBasisAmount >=
      rules.freeDeliveryThreshold;

  const deliveryFee =
    freeDelivery
      ? 0
      : rules.deliveryFee;

  const total = roundMoney_(
    discountedSubtotal +
    deliveryFee
  );

  return {
    listSubtotal: listSubtotal,
    discountedSubtotal: discountedSubtotal,
    discount: discount,
    discountPercent: rules.discountPercent,
    deliveryFee: deliveryFee,
    standardDeliveryFee: rules.deliveryFee,
    freeDelivery: freeDelivery,
    freeDeliveryThreshold: rules.freeDeliveryThreshold,
    freeDeliveryBasis: rules.freeDeliveryBasis,
    freeDeliveryBasisAmount: freeDeliveryBasisAmount,
    minimumOrderItems: rules.minimumOrderItems,
    total: total,
    totalQty: totalQty,

    // Keep legacy fields harmlessly populated in case another old helper
    // reads them. They no longer drive pricing.
    launchEligible: false,
    freeQty: 0,
    launchDiscountQty:
      rules.discountPercent > 0
        ? totalQty
        : 0,
    fullPriceQty:
      rules.discountPercent > 0
        ? 0
        : totalQty
  };
}

/* =========================================================
   ORDERING RULES — CONTROL TOWER / MENU CONFIG
   ========================================================= */

function getOrderingRules_() {
  const spreadsheet = SpreadsheetApp.openById(
    CONTROL_TOWER_SPREADSHEET_ID
  );

  const sheet = spreadsheet.getSheetByName(
    MENU_CONFIG_SHEET
  );

  if (!sheet) {
    throw new Error(
      'Menu Config sheet not found. Ordering is stopped to avoid using an unintended price.'
    );
  }

  const values = sheet.getDataRange().getDisplayValues();

  if (values.length < 2) {
    throw new Error(
      'Menu Config is empty. Ordering is stopped to avoid using an unintended price.'
    );
  }

  const settings = {};

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const key = String(values[rowIndex][0] || '').trim();

    if (!key) {
      continue;
    }

    settings[key] =
      String(values[rowIndex][1] || '').trim();
  }

  const required = [
    'Standard Discount %',
    'Minimum Order Items',
    'Delivery Fee',
    'Free Delivery Threshold',
    'Free Delivery Threshold Basis'
  ];

  required.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(settings, key)) {
      throw new Error(
        'Missing Menu Config setting: ' + key
      );
    }
  });

  const discountPercent =
    parseConfigNumber_(
      settings['Standard Discount %'],
      'Standard Discount %'
    );

  const minimumOrderItems =
    parseConfigNumber_(
      settings['Minimum Order Items'],
      'Minimum Order Items'
    );

  const deliveryFee =
    parseConfigNumber_(
      settings['Delivery Fee'],
      'Delivery Fee'
    );

  const freeDeliveryThreshold =
    parseConfigNumber_(
      settings['Free Delivery Threshold'],
      'Free Delivery Threshold'
    );

  const freeDeliveryBasis =
    settings['Free Delivery Threshold Basis'];

  if (
    discountPercent < 0 ||
    discountPercent > 100
  ) {
    throw new Error(
      'Standard Discount % must be between 0 and 100.'
    );
  }

  if (
    minimumOrderItems < 1 ||
    !Number.isInteger(minimumOrderItems)
  ) {
    throw new Error(
      'Minimum Order Items must be a whole number of at least 1.'
    );
  }

  if (deliveryFee < 0) {
    throw new Error(
      'Delivery Fee cannot be negative.'
    );
  }

  if (freeDeliveryThreshold < 0) {
    throw new Error(
      'Free Delivery Threshold cannot be negative. Use 0 to disable free delivery.'
    );
  }

  if (
    freeDeliveryBasis !== 'Pre-discount food value' &&
    freeDeliveryBasis !== 'Post-discount food value'
  ) {
    throw new Error(
      'Free Delivery Threshold Basis must be "Pre-discount food value" or "Post-discount food value".'
    );
  }

  return {
    discountPercent: discountPercent,
    minimumOrderItems: minimumOrderItems,
    deliveryFee: roundMoney_(deliveryFee),
    freeDeliveryThreshold:
      roundMoney_(freeDeliveryThreshold),
    freeDeliveryBasis: freeDeliveryBasis
  };
}


function validateOrderingRulesObject_(rules) {
  if (!rules || typeof rules !== 'object') {
    throw new Error('Cart pricing rules are missing or invalid.');
  }

  const validated = {
    discountPercent: Number(rules.discountPercent),
    minimumOrderItems: Number(rules.minimumOrderItems),
    deliveryFee: Number(rules.deliveryFee),
    freeDeliveryThreshold: Number(rules.freeDeliveryThreshold),
    freeDeliveryBasis: String(rules.freeDeliveryBasis || '').trim()
  };

  if (
    !Number.isFinite(validated.discountPercent) ||
    validated.discountPercent < 0 ||
    validated.discountPercent > 100
  ) {
    throw new Error('Cart Standard Discount % is invalid.');
  }

  if (
    !Number.isInteger(validated.minimumOrderItems) ||
    validated.minimumOrderItems < 1
  ) {
    throw new Error('Cart Minimum Order Items is invalid.');
  }

  if (
    !Number.isFinite(validated.deliveryFee) ||
    validated.deliveryFee < 0
  ) {
    throw new Error('Cart Delivery Fee is invalid.');
  }

  if (
    !Number.isFinite(validated.freeDeliveryThreshold) ||
    validated.freeDeliveryThreshold < 0
  ) {
    throw new Error('Cart Free Delivery Threshold is invalid.');
  }

  if (
    validated.freeDeliveryBasis !== 'Pre-discount food value' &&
    validated.freeDeliveryBasis !== 'Post-discount food value'
  ) {
    throw new Error('Cart Free Delivery Threshold Basis is invalid.');
  }

  validated.deliveryFee = roundMoney_(validated.deliveryFee);
  validated.freeDeliveryThreshold =
    roundMoney_(validated.freeDeliveryThreshold);

  return validated;
}


function parseConfigNumber_(value, settingName) {
  const text = String(value || '').trim();

  if (text === '') {
    throw new Error(
      'Menu Config setting is blank: ' + settingName
    );
  }

  const number = Number(
    text.replace(/[$,%\s]/g, '')
  );

  if (!Number.isFinite(number)) {
    throw new Error(
      'Menu Config setting is not a valid number: ' +
      settingName
    );
  }

  return number;
}


function formatPercent_(value) {
  const number = Number(value || 0);

  return Number.isInteger(number)
    ? String(number)
    : String(
        Math.round(
          (number + Number.EPSILON) * 100
        ) / 100
      );
}


function findCustomerByPhone_(recipient) {
  const spreadsheet = SpreadsheetApp.openById(
    CONTROL_TOWER_SPREADSHEET_ID
  );

  const sheet = spreadsheet.getSheetByName(
    CUSTOMERS_SHEET
  );

  if (!sheet) {
    throw new Error('Customers sheet not found.');
  }

  const values = sheet.getDataRange().getDisplayValues();

  if (values.length < 2) {
    return null;
  }

  const headers = values[0].map(value => String(value).trim());
  const column = {};

  headers.forEach((header, index) => {
    column[header] = index;
  });

  const required = [
    'Customer ID',
    'Name',
    'Phone',
    'Postcode',
    'Default Delivery Address'
  ];

  required.forEach(header => {
    if (column[header] === undefined) {
      throw new Error('Missing Customers column: ' + header);
    }
  });

  const targetPhone = normalisePhoneDigits_(recipient);

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    const phone = normalisePhoneDigits_(row[column['Phone']]);

    if (phone && phone === targetPhone) {
      return {
        rowNumber: rowIndex + 1,
        customerId: String(row[column['Customer ID']] || '').trim(),
        name: String(row[column['Name']] || '').trim(),
        phone: String(row[column['Phone']] || '').trim(),
        postcode: String(row[column['Postcode']] || '').trim(),
        defaultDeliveryAddress: String(
          row[column['Default Delivery Address']] || ''
        ).trim()
      };
    }
  }

  return null;
}


function createWhatsAppCustomerIntake_(recipient, name, postcode) {
  const spreadsheet = SpreadsheetApp.openById(
    CONTROL_TOWER_SPREADSHEET_ID
  );

  const sheet = spreadsheet.getSheetByName(
    CUSTOMER_INTAKE_SHEET
  );

  if (!sheet) {
    throw new Error('Customer Intake sheet not found.');
  }

  const timestamp = new Date();
  const phone = normalisePhoneDigits_(recipient);
  const suffix = phone.slice(-4);
  const submissionId =
    'WAORD-' +
    Utilities.formatDate(
      timestamp,
      spreadsheet.getSpreadsheetTimeZone() || 'Australia/Sydney',
      'yyyyMMddHHmmss'
    ) +
    '-' + suffix;

  const row = new Array(19).fill('');

  row[0] = submissionId;                 // Submission ID
  row[1] = 'WA-' + suffix;               // Respondent ID
  row[2] = timestamp;                    // Submitted at
  row[3] = String(name || '').trim();    // First name
  row[4] = phone;                        // Mobile number
  row[5] = String(postcode || '').trim();// Suburb or postcode
  row[7] = 'WhatsApp order';             // WhatsApp Contact
  row[8] = true;                         // WhatsApp opt-in / contact allowed
  row[9] = 'whatsapp_order';             // capture_mode
  row[10] = 'whatsapp_order';            // source
  row[18] = 'Created from WhatsApp checkout';

  sheet.appendRow(row);
}


function updateCustomerDefaultAddress_(customerId, address) {
  const spreadsheet = SpreadsheetApp.openById(
    CONTROL_TOWER_SPREADSHEET_ID
  );

  const sheet = spreadsheet.getSheetByName(
    CUSTOMERS_SHEET
  );

  if (!sheet) {
    throw new Error('Customers sheet not found.');
  }

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(value => String(value).trim());
  const idColumn = headers.indexOf('Customer ID');
  const addressColumn = headers.indexOf('Default Delivery Address');

  if (idColumn < 0 || addressColumn < 0) {
    throw new Error('Customers address columns not found.');
  }

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (String(values[rowIndex][idColumn] || '').trim() === customerId) {
      sheet.getRange(
        rowIndex + 1,
        addressColumn + 1
      ).setValue(address);
      return;
    }
  }

  throw new Error('Customer row not found for ' + customerId);
}


function isLaunchOfferEligible_(customerId) {
  if (!customerId) {
    return true;
  }

  const spreadsheet = SpreadsheetApp.openById(
    CONTROL_TOWER_SPREADSHEET_ID
  );

  const sheet = spreadsheet.getSheetByName(
    ORDERS_SHEET
  );

  if (!sheet) {
    throw new Error('Orders sheet not found.');
  }

  const values = sheet.getDataRange().getDisplayValues();

  if (values.length < 2) {
    return true;
  }

  const headers = values[0].map(value => String(value).trim());
  const customerColumn = headers.indexOf('Customer ID');
  const statusColumn = headers.indexOf('Order Status');

  if (customerColumn < 0 || statusColumn < 0) {
    throw new Error('Orders customer/status columns not found.');
  }

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const rowCustomerId = String(
      values[rowIndex][customerColumn] || ''
    ).trim();
    const status = String(
      values[rowIndex][statusColumn] || ''
    ).trim();

    if (
      rowCustomerId === customerId &&
      status &&
      status !== 'Cancelled'
    ) {
      return false;
    }
  }

  return true;
}


function createControlTowerOrder_(recipient, cart, menu, customer, quote) {
  const spreadsheet = SpreadsheetApp.openById(
    CONTROL_TOWER_SPREADSHEET_ID
  );

  const ordersSheet = spreadsheet.getSheetByName(
    ORDERS_SHEET
  );
  const orderItemsSheet = spreadsheet.getSheetByName(
    ORDER_ITEMS_SHEET
  );

  if (!ordersSheet || !orderItemsSheet) {
    throw new Error('Orders or Order Items sheet not found.');
  }

  const orderId = nextOrderId_(ordersSheet);
  const orderRow = firstEmptyRowInColumn_(ordersSheet, 1, 2);
  const deliveryDate = parseYmdDate_(menu.deliveryDate);

  const touchedItemRows = [];

  try {
    ordersSheet.getRange(orderRow, 1, 1, 4).setValues([[
      orderId,
      new Date(),
      deliveryDate,
      customer.customerId
    ]]);

    ordersSheet.getRange(orderRow, 9, 1, 3).setValues([[
      'Pending',
      'Payment Requested',
      DELIVERY_WINDOW
    ]]);

    ordersSheet.getRange(orderRow, 14).setValue(
      'WhatsApp order'
    );

    // Snapshot the exact Menu Config pricing rules used for this order.
    // Z:AD are intentionally values, not formulas, so later Menu Config
    // changes never rewrite the price of an existing order.
    ordersSheet.getRange(orderRow, 26, 1, 5).setValues([[
      quote.discountPercent,
      quote.standardDeliveryFee,
      quote.freeDeliveryThreshold,
      quote.freeDeliveryBasis,
      quote.minimumOrderItems
    ]]);

    const mealMap = {};
    (menu.meals || []).forEach(meal => {
      mealMap[String(meal.itemCode)] = meal;
    });

    let itemRow = firstEmptyRowInColumn_(
      orderItemsSheet,
      1,
      3
    );

    Object.keys(cart.items || {}).forEach(itemCode => {
      const quantity = Number(cart.items[itemCode] || 0);
      const meal = mealMap[itemCode];

      if (!meal || quantity <= 0) {
        return;
      }

      touchedItemRows.push(itemRow);

      orderItemsSheet.getRange(itemRow, 1).setValue(orderId);
      orderItemsSheet.getRange(itemRow, 4).setValue(meal.dishName);
      orderItemsSheet.getRange(itemRow, 7).setValue(quantity);
      orderItemsSheet.getRange(itemRow, 14).setValue('Pending');
      orderItemsSheet.getRange(itemRow, 18).setValue('WhatsApp order');

      itemRow++;
    });

    if (touchedItemRows.length === 0) {
      throw new Error('No valid order items were written.');
    }

    // Let the Control Tower formulas recalculate, then verify that this
    // order is complete before we tell the customer it was accepted.
    let orderCheck = '';
    let capacityControl = '';
    let sheetTotal = 0;
    let totalQty = 0;

    for (let attempt = 0; attempt < 12; attempt++) {
      SpreadsheetApp.flush();
      Utilities.sleep(250);

      orderCheck = String(
        ordersSheet.getRange(orderRow, 24).getDisplayValue() || ''
      ).trim();

      capacityControl = String(
        ordersSheet.getRange(orderRow, 23).getDisplayValue() || ''
      ).trim();

      sheetTotal = Number(
        ordersSheet.getRange(orderRow, 12).getValue() || 0
      );

      totalQty = Number(
        ordersSheet.getRange(orderRow, 20).getValue() || 0
      );

      if (
        totalQty > 0 &&
        orderCheck &&
        Math.abs(sheetTotal - Number(quote.total || 0)) < 0.011
      ) {
        break;
      }
    }

    if (totalQty <= 0) {
      throw new Error(
        'Control Tower did not recognise any order items.'
      );
    }

    if (orderCheck !== 'OK') {
      throw new Error(
        'Control Tower order check failed: ' +
        (orderCheck || 'blank')
      );
    }

    if (
      Math.abs(sheetTotal - Number(quote.total || 0)) >= 0.011
    ) {
      throw new Error(
        'Order total mismatch. WhatsApp quote ' +
        quote.total +
        ', Control Tower total ' +
        sheetTotal
      );
    }

    console.log(
      'Created ' + orderId +
      ' | total ' + sheetTotal +
      ' | capacity ' + capacityControl +
      ' | order check ' + orderCheck
    );

    return {
      orderId: orderId,
      orderRow: orderRow,
      orderCheck: orderCheck,
      capacityControl: capacityControl
    };

  } catch (err) {
    // Roll back only the user-input cells. Formula columns are deliberately
    // left untouched so the Control Tower structure remains intact.
    try {
      clearOrderInputCells_(ordersSheet, orderRow);

      touchedItemRows.forEach(rowNumber => {
        clearOrderItemInputCells_(
          orderItemsSheet,
          rowNumber
        );
      });

      SpreadsheetApp.flush();
    } catch (rollbackErr) {
      console.error(
        'Rollback error after failed order creation: ' +
        (rollbackErr.stack || rollbackErr)
      );
    }

    throw err;
  }
}


function clearOrderInputCells_(ordersSheet, rowNumber) {
  ordersSheet.getRange(rowNumber, 1, 1, 4).clearContent();   // A:D
  ordersSheet.getRange(rowNumber, 9, 1, 3).clearContent();   // I:K
  ordersSheet.getRange(rowNumber, 14).clearContent();        // N
  ordersSheet.getRange(rowNumber, 26, 1, 5).clearContent();  // Z:AD pricing snapshot
  // Formula-driven columns are deliberately left untouched.
}


function clearOrderItemInputCells_(orderItemsSheet, rowNumber) {
  orderItemsSheet.getRange(rowNumber, 1).clearContent();     // A
  orderItemsSheet.getRange(rowNumber, 4).clearContent();     // D
  orderItemsSheet.getRange(rowNumber, 7).clearContent();     // G
  orderItemsSheet.getRange(rowNumber, 14).clearContent();    // N
  orderItemsSheet.getRange(rowNumber, 18).clearContent();    // R
}

function nextOrderId_(ordersSheet) {
  const lastRow = Math.max(ordersSheet.getLastRow(), 2);
  const values = ordersSheet
    .getRange(2, 1, lastRow - 1, 1)
    .getDisplayValues();

  let maxNumber = 0;

  values.forEach(row => {
    const match = String(row[0] || '').match(/(\d+)$/);
    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]));
    }
  });

  return 'ORD-' + String(maxNumber + 1).padStart(6, '0');
}


function firstEmptyRowInColumn_(sheet, columnNumber, startRow) {
  const maxRows = sheet.getMaxRows();
  const count = maxRows - startRow + 1;
  const values = sheet
    .getRange(startRow, columnNumber, count, 1)
    .getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    if (!String(values[i][0] || '').trim()) {
      return startRow + i;
    }
  }

  sheet.insertRowsAfter(maxRows, 100);
  return maxRows + 1;
}


function extractPostcode_(text) {
  const matches = String(text || '').match(/\b\d{4}\b/g);
  return matches && matches.length
    ? matches[matches.length - 1]
    : '';
}


function isOwnerRecipient_(recipient) {
  return normalisePhoneDigits_(recipient) === normalisePhoneDigits_(OWNER_WHATSAPP_PHONE);
}


function getOrderCustomerPhone_(recipient, cartOverride) {
  const cart = cartOverride || getCart_(recipient) || {};

  if (
    isOwnerRecipient_(recipient) &&
    cart.orderForSomeoneElse &&
    cart.orderCustomerPhone
  ) {
    return normalisePhoneDigits_(cart.orderCustomerPhone);
  }

  return normalisePhoneDigits_(recipient);
}


function isValidAustralianMobile_(value) {
  const digits = normalisePhoneDigits_(value);
  return /^614\d{8}$/.test(digits);
}


function formatPhoneForDisplay_(value) {
  const digits = normalisePhoneDigits_(value);

  if (/^614\d{8}$/.test(digits)) {
    const local = '0' + digits.substring(2);
    return local.substring(0, 4) + ' ' +
      local.substring(4, 7) + ' ' +
      local.substring(7);
  }

  return String(value || '');
}


function normalisePhoneDigits_(value) {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.startsWith('0') && digits.length === 10) {
    digits = '61' + digits.substring(1);
  }

  return digits;
}


function parseYmdDate_(value) {
  const match = String(value || '').match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return new Date(value);
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
}


function roundMoney_(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}


function formatMoney_(value) {
  return '$' + roundMoney_(value).toFixed(2);
}


/* =========================================================
   CART STORAGE
   ========================================================= */

function cartPropertyKey_(recipient) {
  return (
    'MK_CART_' +
    String(recipient || '')
      .replace(/\D/g, '')
  );
}


function resetCart_(recipient, menuCycleId) {
  const cart = {
    menuCycleId: String(menuCycleId || ''),
    items: {},
    // Pricing is snapshotted when the cart starts. This prevents an owner
    // Menu Config change from changing the customer's price mid-checkout.
    pricingRules: getOrderingRules_(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  saveCart_(recipient, cart);
  return cart;
}


function ensureCartForMenu_(recipient, menuCycleId) {
  const cart = getCart_(recipient);

  if (
    !cart ||
    !cart.menuCycleId ||
    cart.menuCycleId !== String(menuCycleId || '')
  ) {
    return resetCart_(
      recipient,
      menuCycleId
    );
  }

  return cart;
}


function getCart_(recipient) {
  const props =
    PropertiesService.getScriptProperties();

  const raw = props.getProperty(
    cartPropertyKey_(recipient)
  );

  if (!raw) {
    return null;
  }

  try {
    const cart = JSON.parse(raw);

    if (
      cart.updatedAt &&
      Date.now() - Number(cart.updatedAt) >
        CART_TTL_MS
    ) {
      clearCart_(recipient);
      return null;
    }

    if (!cart.items) {
      cart.items = {};
    }

    // Backward compatibility for carts created before Menu Config pricing
    // snapshots were introduced. Capture the current rules once, then save.
    if (!cart.pricingRules) {
      cart.pricingRules = getOrderingRules_();
      saveCart_(recipient, cart);
    } else {
      cart.pricingRules =
        validateOrderingRulesObject_(cart.pricingRules);
    }

    return cart;
  } catch (err) {
    clearCart_(recipient);
    return null;
  }
}


function saveCart_(recipient, cart) {
  cart.updatedAt = Date.now();

  PropertiesService
    .getScriptProperties()
    .setProperty(
      cartPropertyKey_(recipient),
      JSON.stringify(cart)
    );
}


function addItemToCart_(
  recipient,
  itemCode,
  quantity,
  menuCycleId
) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    let cart = getCart_(recipient);

    if (
      !cart ||
      cart.menuCycleId !== String(menuCycleId || '')
    ) {
      cart = {
        menuCycleId: String(menuCycleId || ''),
        items: {},
        pricingRules: getOrderingRules_(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }

    const code = String(itemCode);
    const currentQty = Number(
      cart.items[code] || 0
    );

    cart.items[code] =
      currentQty +
      Number(quantity || 0);

    saveCart_(recipient, cart);
    return cart;
  } finally {
    lock.releaseLock();
  }
}


function clearCart_(recipient) {
  PropertiesService
    .getScriptProperties()
    .deleteProperty(
      cartPropertyKey_(recipient)
    );
}


function buildCartSummary_(cart, menu) {
  const mealMap = {};

  (menu.meals || []).forEach(meal => {
    mealMap[String(meal.itemCode)] = meal;
  });

  const lines = [];

  Object.keys(cart.items || {})
    .forEach(itemCode => {
      const quantity = Number(
        cart.items[itemCode] || 0
      );

      if (quantity <= 0) {
        return;
      }

      const meal = mealMap[itemCode];

      if (meal) {
        lines.push(
          '• ' +
          quantity +
          ' × ' +
          meal.dishName
        );
      } else {
        lines.push(
          '• ' +
          quantity +
          ' × ' +
          itemCode
        );
      }
    });

  return lines.length
    ? lines.join('\n')
    : 'No meals selected yet.';
}


/* =========================================================
   SEND NORMAL TEXT
   ========================================================= */

function sendTextMessage_(recipient, text) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'text',
    text: {
      body: text
    }
  };

  sendWhatsAppPayload_(payload);
}


/* =========================================================
   GENERIC WHATSAPP CLOUD API SENDER
   ========================================================= */

function sendWhatsAppPayload_(payload) {
  const props =
    PropertiesService.getScriptProperties();

  const token = props.getProperty(
    'WHATSAPP_ACCESS_TOKEN'
  );

  const phoneNumberId = props.getProperty(
    'WHATSAPP_PHONE_NUMBER_ID'
  );

  const graphVersion = props.getProperty(
    'GRAPH_API_VERSION'
  ) || 'v26.0';

  if (!token) {
    throw new Error(
      'Missing Script Property: WHATSAPP_ACCESS_TOKEN'
    );
  }

  if (!phoneNumberId) {
    throw new Error(
      'Missing Script Property: WHATSAPP_PHONE_NUMBER_ID'
    );
  }

  const url =
    'https://graph.facebook.com/' +
    graphVersion +
    '/' +
    phoneNumberId +
    '/messages';

  const response = UrlFetchApp.fetch(
    url,
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization:
          'Bearer ' + token
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  const statusCode =
    response.getResponseCode();

  const responseText =
    response.getContentText();

  console.log(
    'WhatsApp HTTP status: ' +
    statusCode
  );

  console.log(
    'WhatsApp response: ' +
    responseText
  );

  if (
    statusCode < 200 ||
    statusCode >= 300
  ) {
    throw new Error(
      'WhatsApp send failed. HTTP ' +
      statusCode +
      ': ' +
      responseText
    );
  }

  return responseText;
}


/* =========================================================
   SECURE MENU API FOR VERCEL
   ========================================================= */

function handleMenuApiRequest_(e) {
  const properties =
    PropertiesService.getScriptProperties();

  const expectedSecret =
    properties.getProperty(
      'FLOW_MENU_API_SECRET'
    );

  if (!expectedSecret) {
    console.error(
      'FLOW_MENU_API_SECRET is missing.'
    );

    return jsonResponse_({
      ok: false,
      error: 'SERVER_CONFIGURATION_ERROR'
    });
  }

  let requestBody = {};

  try {
    requestBody = JSON.parse(
      e.postData && e.postData.contents
        ? e.postData.contents
        : '{}'
    );
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: 'INVALID_JSON'
    });
  }

  const suppliedSecret = String(
    requestBody.secret || ''
  );

  if (
    !suppliedSecret ||
    suppliedSecret !== expectedSecret
  ) {
    return jsonResponse_({
      ok: false,
      error: 'UNAUTHORISED'
    });
  }

  try {
    const menu = buildActiveMenu_();

    // Keep the current WhatsApp Flow API limit separate from the
    // standard WhatsApp kitchen-first list ordering system.
    if (
      menu.status === 'ACTIVE' &&
      menu.meals &&
      menu.meals.length > MAX_FLOW_MEALS
    ) {
      return jsonResponse_({
        ok: false,
        error: 'MENU_BUILD_ERROR',
        message:
          'Active menu contains ' +
          menu.meals.length +
          ' dishes. Maximum currently supported by the Flow endpoint is ' +
          MAX_FLOW_MEALS +
          '.'
      });
    }

    return jsonResponse_({
      ok: true,
      ...menu
    });
  } catch (err) {
    console.error(
      'Menu API error: ' +
      (err.stack || err)
    );

    return jsonResponse_({
      ok: false,
      error: 'MENU_BUILD_ERROR',
      message: String(
        err.message || err
      )
    });
  }
}


/* =========================================================
   BUILD ACTIVE MENU FROM CONTROL TOWER
   ========================================================= */

function buildActiveMenu_() {
  const spreadsheet =
    SpreadsheetApp.openById(
      CONTROL_TOWER_SPREADSHEET_ID
    );

  const timeZone =
    spreadsheet.getSpreadsheetTimeZone() ||
    'Australia/Sydney';

  const weeklyMenuSheet =
    spreadsheet.getSheetByName(
      WEEKLY_MENU_SHEET
    );

  const dishesSheet =
    spreadsheet.getSheetByName(
      DISHES_SHEET
    );

  if (!weeklyMenuSheet) {
    throw new Error(
      'Weekly Menu sheet not found.'
    );
  }

  if (!dishesSheet) {
    throw new Error(
      'Dishes sheet not found.'
    );
  }

  const weeklyRange =
    weeklyMenuSheet.getDataRange();

  const weeklyValues =
    weeklyRange.getValues();

  const weeklyDisplay =
    weeklyRange.getDisplayValues();

  if (weeklyValues.length < 2) {
    return {
      status: 'NO_ACTIVE_MENU',
      meals: []
    };
  }

  const headers = weeklyValues[0]
    .map(value =>
      String(value).trim()
    );

  const column = {};

  headers.forEach(
    (header, index) => {
      column[header] = index;
    }
  );

  const requiredWeeklyColumns = [
    'Menu Cycle ID',
    'Delivery Date',
    'Item Code',
    'Dish Name',
    'Menu Kitchen Name',
    'Customer Price',
    'Menu Description',
    'Image URL',
    'Cook Section Order',
    'Dish Display Order',
    'Remaining Servings',
    'Menu Status',
    'Availability Status',
    'Menu Card Readiness'
  ];

  requiredWeeklyColumns.forEach(
    header => {
      if (column[header] === undefined) {
        throw new Error(
          'Missing Weekly Menu column: ' +
          header
        );
      }
    }
  );

  const dishValues =
    dishesSheet.getDataRange()
      .getValues();

  const dishHeaders = dishValues[0]
    .map(value =>
      String(value).trim()
    );

  const dishColumn = {};

  dishHeaders.forEach(
    (header, index) => {
      dishColumn[header] = index;
    }
  );

  if (
    dishColumn['Item Code'] === undefined ||
    dishColumn['Portion / Pack'] === undefined
  ) {
    throw new Error(
      'Required Dishes columns not found.'
    );
  }

  const portionByItemCode = {};
  const cookPayByItemCode = {};

  for (
    let rowIndex = 1;
    rowIndex < dishValues.length;
    rowIndex++
  ) {
    const row = dishValues[rowIndex];

    const itemCode = String(
      row[
        dishColumn['Item Code']
      ] || ''
    ).trim();

    if (!itemCode) {
      continue;
    }

    portionByItemCode[itemCode] =
      String(
        row[
          dishColumn['Portion / Pack']
        ] || ''
      ).trim();

    if (dishColumn['Cook Pay / Serving'] !== undefined) {
      cookPayByItemCode[itemCode] = Number(
        row[dishColumn['Cook Pay / Serving']] || 0
      );
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eligibleRows = [];

  for (
    let rowIndex = 1;
    rowIndex < weeklyValues.length;
    rowIndex++
  ) {
    const row = weeklyValues[rowIndex];

    const menuStatus = String(
      row[column['Menu Status']] || ''
    ).trim();

    const availabilityStatus = String(
      row[column['Availability Status']] || ''
    ).trim();

    const readiness = String(
      row[column['Menu Card Readiness']] || ''
    ).trim();

    const remaining = Number(
      row[column['Remaining Servings']] || 0
    );

    if (
      menuStatus !== 'Available' ||
      availabilityStatus !== 'Available' ||
      readiness !== 'READY' ||
      remaining <= 0
    ) {
      continue;
    }

    const deliveryValue =
      row[column['Delivery Date']];

    let deliveryDate;

    if (deliveryValue instanceof Date) {
      deliveryDate = new Date(
        deliveryValue.getTime()
      );
    } else {
      deliveryDate = new Date(
        deliveryValue
      );
    }

    if (isNaN(deliveryDate.getTime())) {
      continue;
    }

    deliveryDate.setHours(0, 0, 0, 0);

    if (
      deliveryDate.getTime() <
      today.getTime()
    ) {
      continue;
    }

    eligibleRows.push({
      rowIndex: rowIndex,
      row: row,
      deliveryDate: deliveryDate
    });
  }

  if (eligibleRows.length === 0) {
    return {
      status: 'NO_ACTIVE_MENU',
      meals: []
    };
  }

  const nextDeliveryTime = Math.min(
    ...eligibleRows.map(
      item =>
        item.deliveryDate.getTime()
    )
  );

  const menuRows = eligibleRows.filter(
    item =>
      item.deliveryDate.getTime() ===
      nextDeliveryTime
  );

  menuRows.sort(
    (a, b) => {
      const aSection = Number(
        a.row[
          column['Cook Section Order']
        ] || 999
      );

      const bSection = Number(
        b.row[
          column['Cook Section Order']
        ] || 999
      );

      if (aSection !== bSection) {
        return aSection - bSection;
      }

      const aDish = Number(
        a.row[
          column['Dish Display Order']
        ] || 999
      );

      const bDish = Number(
        b.row[
          column['Dish Display Order']
        ] || 999
      );

      return aDish - bDish;
    }
  );

  const meals = menuRows.map(
    item => {
      const row = item.row;
      const displayRow =
        weeklyDisplay[item.rowIndex];

      const itemCode = String(
        row[column['Item Code']] || ''
      ).trim();

      return {
        id: itemCode,
        itemCode: itemCode,
        kitchenName: String(
          row[
            column['Menu Kitchen Name']
          ] || ''
        ).trim(),
        dishName: String(
          row[column['Dish Name']] || ''
        ).trim(),
        description: String(
          row[
            column['Menu Description']
          ] || ''
        ).trim(),
        portion:
          portionByItemCode[itemCode] || '',
        price: Number(
          row[
            column['Customer Price']
          ] || 0
        ),
        cookPay: Number(
          cookPayByItemCode[itemCode] || 0
        ),
        priceDisplay: String(
          displayRow[
            column['Customer Price']
          ] || ''
        ).trim(),
        imageUrl: String(
          row[column['Image URL']] || ''
        ).trim(),
        remainingServings: Number(
          row[
            column['Remaining Servings']
          ] || 0
        )
      };
    }
  );

  const deliveryDate =
    new Date(nextDeliveryTime);

  const orderDeadline =
    new Date(nextDeliveryTime);

  orderDeadline.setDate(
    orderDeadline.getDate() - 2
  );

  orderDeadline.setHours(
    20,
    0,
    0,
    0
  );

  const firstMenuRow =
    menuRows[0].row;

  return {
    status: 'ACTIVE',
    menuCycleId: String(
      firstMenuRow[
        column['Menu Cycle ID']
      ] || ''
    ).trim(),
    deliveryDate:
      Utilities.formatDate(
        deliveryDate,
        timeZone,
        'yyyy-MM-dd'
      ),
    deliveryDateDisplay:
      Utilities.formatDate(
        deliveryDate,
        timeZone,
        'EEE d MMM'
      ),
    orderDeadline:
      Utilities.formatDate(
        orderDeadline,
        timeZone,
        "yyyy-MM-dd'T'HH:mm:ss"
      ),
    orderDeadlineDisplay:
      Utilities.formatDate(
        orderDeadline,
        timeZone,
        'EEE d MMM, h:mm a'
      ),
    mealCount: meals.length,
    meals: meals
  };
}


/* =========================================================
   HELPERS
   ========================================================= */

function truncateText_(value, maxLength) {
  const text = String(
    value || ''
  ).trim();

  if (text.length <= maxLength) {
    return text;
  }

  return (
    text.substring(
      0,
      maxLength - 1
    ).trim() +
    '…'
  );
}


function jsonResponse_(object) {
  return ContentService
    .createTextOutput(
      JSON.stringify(object)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}


/* =========================================================
   AUTHORIZATION HELPER
   ========================================================= */

function authorizeControlTowerAccess() {
  SpreadsheetApp.openById(
    CONTROL_TOWER_SPREADSHEET_ID
  );
}


/* =========================================================
   TEST: NORMAL WHATSAPP TEXT
   ========================================================= */

function testSendWhatsApp() {
  const recipient =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'WHATSAPP_TEST_NUMBER'
      );

  if (!recipient) {
    throw new Error(
      'Missing Script Property: WHATSAPP_TEST_NUMBER'
    );
  }

  sendTextMessage_(
    recipient,
    'Ma Kitchens WhatsApp API test successful.'
  );
}


/* =========================================================
   TEST: LIVE INTERACTIVE MEAL LIST
   ========================================================= */

function testSendMealList() {
  const recipient =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'WHATSAPP_TEST_NUMBER'
      );

  if (!recipient) {
    throw new Error(
      'Missing Script Property: WHATSAPP_TEST_NUMBER'
    );
  }

  startNewOrder_(recipient);
}


/* =========================================================
   TEST: DYNAMIC WHATSAPP FLOW
   ========================================================= */

function testSendOrderFlow() {
  const props =
    PropertiesService.getScriptProperties();

  const token = props.getProperty(
    'WHATSAPP_ACCESS_TOKEN'
  );

  const phoneNumberId = props.getProperty(
    'WHATSAPP_PHONE_NUMBER_ID'
  );

  const graphVersion = props.getProperty(
    'GRAPH_API_VERSION'
  ) || 'v26.0';

  const recipient = props.getProperty(
    'WHATSAPP_TEST_NUMBER'
  );

  const flowName = props.getProperty(
    'WHATSAPP_ORDER_FLOW_NAME'
  ) || 'Ma Kitchens Order Flow';

  if (
    !token ||
    !phoneNumberId ||
    !recipient
  ) {
    throw new Error(
      'Missing WhatsApp Script Property.'
    );
  }

  const url =
    'https://graph.facebook.com/' +
    graphVersion +
    '/' +
    phoneNumberId +
    '/messages';

  const flowToken =
    'MK_ORDER_TEST_' +
    new Date().getTime();

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'flow',
      body: {
        text:
          'Tap below to test the Ma Kitchens ordering experience.'
      },
      action: {
        name: 'flow',
        parameters: {
          mode: 'draft',
          flow_message_version: '3',
          flow_token: flowToken,
          flow_name: flowName,
          flow_cta: 'Start order',
          flow_action: 'data_exchange'
        }
      }
    }
  };

  sendWhatsAppPayload_(payload);
}


/* =========================================================
   TEST: STATIC WHATSAPP FLOW
   ========================================================= */

function testSendStaticOrderFlow() {
  const props =
    PropertiesService.getScriptProperties();

  const recipient = props.getProperty(
    'WHATSAPP_TEST_NUMBER'
  );

  if (!recipient) {
    throw new Error(
      'Missing Script Property: WHATSAPP_TEST_NUMBER'
    );
  }

  const flowToken =
    'MK_STATIC_TEST_' +
    new Date().getTime();

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'flow',
      body: {
        text:
          'Tap below to test Ma Kitchens ordering.'
      },
      action: {
        name: 'flow',
        parameters: {
          mode: 'draft',
          flow_message_version: '3',
          flow_token: flowToken,
          flow_name:
            'Ma Kitchens Order Static',
          flow_cta: 'Start order',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'STATIC_TEST'
          }
        }
      }
    }
  };

  sendWhatsAppPayload_(payload);
}

function setNewWhatsAppPhoneNumberId() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(
    'WHATSAPP_PHONE_NUMBER_ID',
    '1393229007197016'
  );
  console.log(
    'Saved phone number ID: ' +
    props.getProperty('WHATSAPP_PHONE_NUMBER_ID')
  );
}

/* ORDER ENTRY: this section follows the unchanged original Code.gs.
 * Install the supplied complete Code-order-entry.gs as production Code.gs.
 * Existing WhatsApp, feedback and Routific functions are not modified.
 * Run orderEntrySetup once from the bound production project.
 */
const OE = Object.freeze({sheet:'Order Entry',version:'OE_V1',first:21,count:20,ownerPhone:'61420306705',addressHeader:'Delivery Address (SNAPSHOT)',itemHeader:'Item Code (SNAPSHOT)'});

function oeBook_() {
  if(CONTROL_TOWER_SPREADSHEET_ID!=='1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4') throw new Error('Order Entry production spreadsheet configuration differs.');
  const b=SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID);
  const owner=b.getOwner(), email=Session.getEffectiveUser().getEmail();
  if(!owner || !email || email!==owner.getEmail()) throw new Error('Order Entry is restricted to the spreadsheet owner.');
  if(OWNER_WHATSAPP_PHONE!==OE.ownerPhone) throw new Error('Owner confirmation number needs verification.');
  return b;
}
function oeSheet_(b) {const s=b.getSheetByName(OE.sheet);if(!s)throw new Error('Order Entry tab is missing.');return s;}
function oeLock_(fn) {const l=LockService.getScriptLock();l.waitLock(10000);try{return fn();}finally{l.releaseLock();}}
function oeCell_(s,row,col,value) {
  const v=value===null?{}:typeof value==='number'?{numberValue:value}:typeof value==='boolean'?{boolValue:value}:{stringValue:String(value)};
  return {updateCells:{range:{sheetId:s.getSheetId(),startRowIndex:row-1,endRowIndex:row,startColumnIndex:col-1,endColumnIndex:col},rows:[{values:[{userEnteredValue:v}]}],fields:'userEnteredValue'}};
}
function oeFormula_(s,row,col,value) {const r=oeCell_(s,row,col,'');r.updateCells.rows[0].values[0].userEnteredValue={formulaValue:value};return r;}
function oeBatch_(b,requests) {if(requests.length)Sheets.Spreadsheets.batchUpdate({requests:requests},b.getId());}
function oeMeta_(s) {return s.getRange('K1:K18').getDisplayValues().map(r=>r[0]);}
function oeStatus_(b,s,text) {oeBatch_(b,[oeCell_(s,42,1,text)]);b.toast(text,'Order Entry',8);}
function oeDraft_(s) {
  const a=s.getRange('C7:C16').getDisplayValues().map(r=>String(r[0]||'').trim());
  const lines=s.getRange(21,2,20,3).getDisplayValues().map(r=>({label:String(r[0]||'').trim(),quantity:String(r[2]||'').trim()}));
  return {lookup:a[0],customerId:a[1],name:a[2],phone:a[3],street:a[4],suburb:a[5],postcode:a[6],consent:a[7],instructions:a[8],delivery:oeDate_(s.getRange('C16').getValue(),s.getParent().getSpreadsheetTimeZone()),lines:lines};
}
function oeHash_(value) {return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value))).replace(/=+$/,'');}
function oeSerial_(date,b) {
  const a=Utilities.formatDate(date,b.getSpreadsheetTimeZone()||'Australia/Sydney','yyyy-MM-dd-HH-mm-ss').split('-').map(Number);
  return (Date.UTC(a[0],a[1]-1,a[2],a[3],a[4],a[5])-Date.UTC(1899,11,30))/86400000;
}
function oeDeliverySerial_(ymd) {const a=ymd.split('-').map(Number);return (Date.UTC(a[0],a[1]-1,a[2])-Date.UTC(1899,11,30))/86400000;}
function oeLabel_(meal) {return '['+meal.itemCode+'] '+meal.dishName+' | '+meal.kitchenName;}
function oeMenuLookup_(s,menu) {
  return {updateCells:{range:{sheetId:s.getSheetId(),startRowIndex:1,endRowIndex:1001,startColumnIndex:13,endColumnIndex:18},rows:Array.from({length:1000},(_,i)=>{const m=menu.meals[i];return {values:m?[{userEnteredValue:{stringValue:oeLabel_(m)}},{userEnteredValue:{stringValue:m.itemCode}},{userEnteredValue:{stringValue:m.kitchenName}},{userEnteredValue:{numberValue:m.price}},{userEnteredValue:{numberValue:m.remainingServings}}]:[{},{},{},{},{}]};}),fields:'userEnteredValue'}};
}
function oeAddress_(d) {
  let a=d.street+(d.suburb&&!d.street.toLowerCase().includes(d.suburb.toLowerCase())?', '+d.suburb:'');
  if(!new RegExp('(?:^|\\s)'+d.postcode+'$').test(a))a+=' '+d.postcode;
  return a.trim();
}
function oeCart_(d,menu) {
  if(!d.name || d.name.length>150)throw new Error('Enter a customer name, up to 150 characters.');
  const phone=normalisePhoneDigits_(d.phone);
  if(!/^614\d{8}$/.test(phone))throw new Error('Enter a valid Australian mobile number.');
  if(!/^\d{4}$/.test(d.postcode) || !d.street || d.street.length>400 || d.suburb.length>100)throw new Error('Enter a delivery address and four-digit postcode.');
  if(d.instructions.length>500)throw new Error('Delivery instructions must be 500 characters or fewer.');
  if(!['Keep existing','Yes','No'].includes(d.consent))throw new Error('Choose feedback consent: Keep existing, Yes or No.');
  if(menu.status!=='ACTIVE' || d.delivery!==menu.deliveryDate)throw new Error('The menu date has changed. Start a new draft.');
  const map={};menu.meals.forEach(m=>{if(map[m.itemCode])throw new Error('Duplicate active menu item.');map[m.itemCode]=m;});
  const items={};
  d.lines.forEach((line,i)=>{
    if(!line.label&&!line.quantity)return;
    if(!line.label || !/^\d+$/.test(line.quantity) || !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity)<1)throw new Error('Check dish and whole-number quantity on line '+(i+1)+'.');
    const match=line.label.match(/^\[([^\]]+)\] /), meal=match&&map[match[1]];
    if(!meal || oeLabel_(meal)!==line.label)throw new Error('A selected dish is no longer on this menu. Refresh the menu and select it again.');
    items[meal.itemCode]=(items[meal.itemCode]||0)+Number(line.quantity);
    if(!Number.isSafeInteger(items[meal.itemCode]))throw new Error('Quantity is too large.');
  });
  if(!Object.keys(items).length)throw new Error('Add at least one dish.');
  const cart={items:items,menuCycleId:menu.menuCycleId,customerName:d.name,deliveryAddress:oeAddress_(d),postcode:d.postcode,orderCustomerPhone:phone,orderForSomeoneElse:true};
  const error=validateCartAvailability_(cart,menu);if(error)throw new Error(error);
  return cart;
}
function oeQuote_(cart,menu) {
  const q=calculateCartQuote_(cart,menu);
  if(q.totalQty<q.minimumOrderItems)throw new Error('Minimum order is '+q.minimumOrderItems+' items. This draft has '+q.totalQty+'.');
  return q;
}
function oeConfirmation_(cart,menu,q,id) {
  return 'Order received ✅\n\nCustomer: '+cart.customerName+' ('+formatPhoneForDisplay_(cart.orderCustomerPhone)+')\nOrder: '+id+'\nOrder Details\n'+buildCartSummary_(cart,menu)+
    '\n\nTotal: '+formatMoney_(q.total)+'\nDelivery: '+(menu.deliveryDateDisplay||'')+', '+DELIVERY_WINDOW+'\nAddress: '+cart.deliveryAddress+
    '\n\nPayment to be made through PayID as per the information below:\nPayID: '+PAYMENT_PAYID+'\nReference: '+id+
    '\n\nWhen you make the payment, please send us payment confirmation via WhatsApp on 0420 246 023 (a screenshot or your banking app confirmation message) so we can match it to your order.';
}
function orderEntryMenu() {
  SpreadsheetApp.getUi().createMenu('Order Entry')
    .addItem('New draft / refresh menu','orderEntryNewDraft')
    .addItem('Load selected customer','orderEntryLoadCustomer')
    .addItem('Review order','orderEntryReview')
    .addItem('Place order','orderEntryPlaceOrder')
    .addSeparator().addItem('Check recorded order','orderEntryCheckOrder')
    .addItem('Recover an uncertain submission','orderEntryRecoverSubmission')
    .addItem('Resend confirmation to me','orderEntryResendConfirmation').addToUi();
}
function orderEntrySetup() {
  const b=oeBook_(),s=oeSheet_(b);
  oeLock_(()=>{
    const m=oeMeta_(s);if(m[0]&&m[0]!==OE.version)throw new Error('Order Entry metadata is occupied. Setup stopped.');
    oeAddressSetup_(b);
    oeItemSetup_(b);
    const requests=[oeCell_(s,1,11,OE.version),oeCell_(s,3,1,'ORDER ENTRY • 20 dish rows • Confirmations go to your number')];
    for(const row of [10,13])requests.push({repeatCell:{range:{sheetId:s.getSheetId(),startRowIndex:row-1,endRowIndex:row,startColumnIndex:2,endColumnIndex:6},cell:{userEnteredFormat:{numberFormat:{type:'TEXT'}}},fields:'userEnteredFormat.numberFormat'}});
    for(let row=21;row<=40;row++){
      requests.push(oeFormula_(s,row,3,'=IF(B'+row+'="","",IFERROR(XLOOKUP(B'+row+',$N$2:$N$1001,$P$2:$P$1001),"Unavailable"))'));
      requests.push(oeFormula_(s,row,5,'=IF(B'+row+'="","",IFERROR(XLOOKUP(B'+row+',$N$2:$N$1001,$Q$2:$Q$1001),""))'));
      requests.push(oeFormula_(s,row,6,'=IF(OR(B'+row+'="",D'+row+'=""),"",IFERROR(ROUND(D'+row+'*E'+row+',2),""))'));
    }
    const f={8:'=IF(K4="","",SUM(F21:F40))',9:'=IF(J8="","",ROUND(J8*K14/100,2))',10:'=IF(J8="","",J8-J9)',11:'=IF(J8="","",IF(AND(K17>0,IF(K18="Post-discount food value",J10,J8)>=K17),0,K16))',13:'=IF(J8="","",ROUND(J10+J11,2))'};
    Object.keys(f).forEach(r=>requests.push(oeFormula_(s,Number(r),10,f[r])));
    requests.push({repeatCell:{range:{sheetId:s.getSheetId(),startRowIndex:7,endRowIndex:13,startColumnIndex:9,endColumnIndex:10},cell:{userEnteredFormat:{numberFormat:{type:'CURRENCY',pattern:'"$"#,##0.00'}}},fields:'userEnteredFormat.numberFormat'}});
    requests.push({repeatCell:{range:{sheetId:s.getSheetId(),startRowIndex:20,endRowIndex:40,startColumnIndex:4,endColumnIndex:6},cell:{userEnteredFormat:{numberFormat:{type:'CURRENCY',pattern:'"$"#,##0.00'}}},fields:'userEnteredFormat.numberFormat'}});
    requests.push({setDataValidation:{range:{sheetId:s.getSheetId(),startRowIndex:13,endRowIndex:14,startColumnIndex:2,endColumnIndex:6},rule:{condition:{type:'ONE_OF_LIST',values:['Keep existing','Yes','No'].map(v=>({userEnteredValue:v}))},strict:true,showCustomUi:true}}});
    requests.push(...oeControls_(s));
    requests.push(...oeQuantityRules_(s));
    const snapshot=JSON.parse(m[3]||'{}');
    if(snapshot.deliveryDate && typeof s.getRange('C16').getValue()==='string' && s.getRange('C16').getDisplayValue()===buildActiveMenu_().deliveryDateDisplay)requests.push(oeCell_(s,16,3,oeDeliverySerial_(snapshot.deliveryDate)));
    requests.push(oeCell_(s,47,1,'Review before placing. Changes after review require another review. Confirmation failures never recreate an order.'));
    oeBatch_(b,requests);
  });
  // Separate installable handlers preserve the existing WhatsApp and sheet handlers.
  const exists=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='orderEntryMenu'&&t.getTriggerSourceId()===b.getId());
  if(!exists)ScriptApp.newTrigger('orderEntryMenu').forSpreadsheet(b).onOpen().create();
  const edits=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='orderEntryEdited'&&t.getTriggerSourceId()===b.getId());
  if(!edits.length)ScriptApp.newTrigger('orderEntryEdited').forSpreadsheet(b).onEdit().create();
  edits.slice(1).forEach(t=>ScriptApp.deleteTrigger(t));
  try{orderEntryMenu();}catch(_){console.log('Reopen the Control Tower to see the Order Entry menu.');}
  if(!oeMeta_(s)[1])orderEntryNewDraft();else {if(oeMeta_(s)[2]==='DRAFT'&&s.getRange('C7').getDisplayValue()!=='New customer'&&!s.getRange('C8').getDisplayValue())orderEntryLoadCustomer();oeStatus_(b,s,'Setup complete. Customer auto-fill and sheet controls are ready. Existing draft preserved.');}
}
function oeAddressSetup_(b) {
  const s=b.getSheetByName(ORDERS_SHEET),headers=s.getRange(1,1,1,s.getMaxColumns()).getDisplayValues()[0];
  if(headers[30] && headers[30]!==OE.addressHeader)throw new Error('Orders column AE is occupied. No changes made.');
  const formula=s.getRange('G2').getFormula();
  const expected='=ARRAYFORMULA(IF(D2:D2000="","",IF(AE2:AE2000<>"",AE2:AE2000,XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!AD$2:AD$1000,""))))';
  if(headers[30]===OE.addressHeader){if(formula!==expected)throw new Error('Address snapshot formula differs. Setup stopped for review.');return;}
  const old='=ARRAYFORMULA(IF(D2:D2000="","",XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!AD$2:AD$1000,"")))';
  if(formula!==old)throw new Error('Orders address formula has changed. Setup stopped for review.');
  const data=s.getRange(2,1,1999,7).getDisplayValues();
  if(data.some(r=>r[0]&&/^#/.test(r[6])))throw new Error('An existing address has a formula error. Setup stopped.');
  const requests=[];
  if(s.getMaxColumns()<31)requests.push({appendDimension:{sheetId:s.getSheetId(),dimension:'COLUMNS',length:31-s.getMaxColumns()}});
  requests.push(oeCell_(s,1,31,OE.addressHeader));
  data.forEach((r,i)=>{if(r[0]&&r[6])requests.push(oeCell_(s,i+2,31,r[6]));});
  requests.push(oeFormula_(s,2,7,expected));oeBatch_(b,requests);
}
function oeCustomers_(b) {
  const s=b.getSheetByName(CUSTOMERS_SHEET),a=s.getRange(1,1,1000,30).getDisplayValues(),h=a.shift();
  for(const [i,name]of [[0,'Customer ID'],[1,'Name'],[2,'Phone'],[3,'Area / Suburb'],[9,'WhatsApp Opt-In'],[29,'Default Delivery Address']])if(h[i]!==name)throw new Error('Customers schema changed.');
  return a.map((r,i)=>({row:i+2,id:r[0],name:r[1],phone:r[2],suburb:r[3],postcode:r[4],consent:r[9],address:r[29],label:r[0]+' | '+r[1]+' | '+formatPhoneForDisplay_(r[2])})).filter(c=>c.id);
}
function oeItemSetup_(b) {
  const s=b.getSheetByName(ORDER_ITEMS_SHEET),headers=s.getRange(1,1,1,s.getMaxColumns()).getDisplayValues()[0];
  if(headers[22]&&headers[22]!==OE.itemHeader)throw new Error('Order Items column W is occupied. Setup stopped.');
  const old='=MAP(B2:B5000,D2:D5000,LAMBDA(dt,name,IF(name="","",IF(dt="","",IFERROR(INDEX(FILTER(\'Weekly Menu\'!D$2:D$1000,\'Weekly Menu\'!C$2:C$1000=dt,\'Weekly Menu\'!E$2:E$1000=name,\'Weekly Menu\'!U$2:U$1000="Available"),1),"")))))';
  const expected='=MAP(B2:B5000,D2:D5000,W2:W5000,LAMBDA(dt,name,code,IF(name="","",IF(dt="","",IF(code<>"",code,IFERROR(INDEX(FILTER(\'Weekly Menu\'!D$2:D$1000,\'Weekly Menu\'!C$2:C$1000=dt,\'Weekly Menu\'!E$2:E$1000=name,\'Weekly Menu\'!U$2:U$1000="Available"),1),""))))))';
  const formula=s.getRange('E2').getFormula();
  if(headers[22]===OE.itemHeader){if(formula!==expected)throw new Error('Item code snapshot formula differs. Setup stopped.');return;}
  if(formula!==old)throw new Error('Order Items code formula has changed. Setup stopped.');
  const requests=[];if(s.getMaxColumns()<23)requests.push({appendDimension:{sheetId:s.getSheetId(),dimension:'COLUMNS',length:23-s.getMaxColumns()}});
  requests.push(oeCell_(s,1,23,OE.itemHeader),oeFormula_(s,2,5,expected));oeBatch_(b,requests);
}
function oeFindCustomer_(customers,d) {
  const phone=normalisePhoneDigits_(d.phone),matches=customers.filter(c=>normalisePhoneDigits_(c.phone)===phone);
  if(matches.length>1)throw new Error('Multiple customer records share that phone. Resolve them before ordering.');
  const c=matches[0]||null;
  if(d.customerId&&(!c||c.id!==d.customerId))throw new Error('Customer ID and mobile do not match. Load the customer again.');
  if(c&&c.name!==d.name)throw new Error('Existing customer name differs. Load that customer or update their record separately.');
  if(!c&&d.consent==='Keep existing')throw new Error('Choose Yes or No for a new customer’s feedback consent.');
  return c;
}
function orderEntryNewDraft() { return oeNewDraft_(false); }
function oeNewDraft_(fromControl) {
  const b=oeBook_(),s=oeSheet_(b);
  const old=oeMeta_(s);
  if(old[2]==='COMMITTING'||old[2]==='REVIEW_REQUIRED'||old[7]==='SENDING'||old[7]==='UNCERTAIN')throw new Error('Check the existing recorded order or uncertain confirmation before clearing this draft.');
  if(!fromControl&&old[1]&&old[2]!=='CREATED'){
    const ui=SpreadsheetApp.getUi();if(ui.alert('New draft','Clear the current draft and load the latest menu?',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
  }
  oeLock_(()=>{
    const current=oeMeta_(s);if(current[2]==='COMMITTING'||current[2]==='REVIEW_REQUIRED'||current[7]==='SENDING'||current[7]==='UNCERTAIN')throw new Error('Existing submission or message needs reconciliation first.');
    const menu=buildActiveMenu_();if(menu.status!=='ACTIVE')throw new Error('No active menu. Publish an upcoming menu first.');
    const rules=getOrderingRules_(),customers=oeCustomers_(b);
    if(customers.length>999||menu.meals.length>1000)throw new Error('Lookup list exceeds configured size.');
    const requests=[];
    for(let r=7;r<=16;r++)requests.push(oeCell_(s,r,3,''));
    for(let r=21;r<=40;r++)requests.push(oeCell_(s,r,2,''),oeCell_(s,r,4,''));
    for(let r=1;r<=18;r++)requests.push(oeCell_(s,r,11,''));
    requests.push(oeCell_(s,1,11,OE.version),oeCell_(s,2,11,Utilities.getUuid()),oeCell_(s,3,11,'DRAFT'),oeCell_(s,4,11,JSON.stringify({menuCycleId:menu.menuCycleId,deliveryDate:menu.deliveryDate})),oeCell_(s,14,11,rules.discountPercent),oeCell_(s,15,11,rules.minimumOrderItems),oeCell_(s,16,11,rules.deliveryFee),oeCell_(s,17,11,rules.freeDeliveryThreshold),oeCell_(s,18,11,rules.freeDeliveryBasis));
    requests.push(oeCell_(s,7,3,'New customer'),oeCell_(s,14,3,'No'),oeCell_(s,16,3,oeDeliverySerial_(menu.deliveryDate)),oeCell_(s,15,10,'Not created'),oeCell_(s,16,10,'Draft'),oeCell_(s,17,10,formatPhoneForDisplay_(OE.ownerPhone)),oeCell_(s,20,8,'Complete the green fields, then tick REVIEW ORDER below.'));
    requests.push({updateCells:{range:{sheetId:s.getSheetId(),startRowIndex:1,endRowIndex:1001,startColumnIndex:11,endColumnIndex:18},rows:Array.from({length:1000},(_,i)=>({values:[{userEnteredValue:{stringValue:i===0?'New customer':customers[i-1]?.label||''}},{userEnteredValue:{stringValue:i===0?'':customers[i-1]?.id||''}},{userEnteredValue:{stringValue:menu.meals[i]?oeLabel_(menu.meals[i]):''}},{userEnteredValue:{stringValue:menu.meals[i]?.itemCode||''}},{userEnteredValue:{stringValue:menu.meals[i]?.kitchenName||''}},menu.meals[i]?{userEnteredValue:{numberValue:menu.meals[i].price}}:{},menu.meals[i]?{userEnteredValue:{numberValue:menu.meals[i].remainingServings}}:{}]})),fields:'userEnteredValue'}});
    for(const [range,ref]of [[{sheetId:s.getSheetId(),startRowIndex:6,endRowIndex:7,startColumnIndex:2,endColumnIndex:6},"='Order Entry'!$L$2:$L$1001"],[{sheetId:s.getSheetId(),startRowIndex:20,endRowIndex:40,startColumnIndex:1,endColumnIndex:2},"='Order Entry'!$N$2:$N$1001"]])requests.push({setDataValidation:{range:range,rule:{condition:{type:'ONE_OF_RANGE',values:[{userEnteredValue:ref}]},strict:true,showCustomUi:true}}});
    requests.push(...oeQuantityRules_(s,[]));oeBatch_(b,requests);oeStatus_(b,s,'New draft ready. Selecting a customer loads their details automatically.');
  });
}
function orderEntryLoadCustomer() {
  const b=oeBook_(),s=oeSheet_(b);
  oeLock_(()=>{
    const m=oeMeta_(s);if(m[2]!=='DRAFT')throw new Error('Start a new draft before changing the customer.');
    const label=s.getRange('C7').getDisplayValue(),c=oeCustomers_(b).find(c=>c.label===label);
    if(label!=='New customer'&&!c)throw new Error('Choose a customer from the dropdown.');
    const address=c?oeCustomerAddressFields_(c):null;
    const values=c?[c.id,c.name,formatPhoneForDisplay_(c.phone),address.street,address.suburb,c.postcode,'Keep existing','']:['','','','','','','No',''];
    const requests=values.map((v,i)=>oeCell_(s,8+i,3,v));requests.push(oeCell_(s,5,11,''),oeCell_(s,20,8,'Customer loaded. Add dishes and tick REVIEW ORDER.'));
    oeBatch_(b,requests);oeStatus_(b,s,c?'Customer loaded. Check address and postcode.':'Enter the new customer’s details and consent.');
  });
}
function oePrepare_(b,s) {
  const d=oeDraft_(s),m=oeMeta_(s);
  if(m[0]!==OE.version||!m[1])throw new Error('Run Order Entry setup first.');
  if(m[2]!=='DRAFT')throw new Error('This draft already has a recorded or uncertain order. Check recorded order.');
  const menu=oeMenuForDate_(d.delivery),snapshot=JSON.parse(m[3]||'{}');
  if(menu.menuCycleId!==snapshot.menuCycleId)throw new Error('Active menu changed. Start a new draft.');
  const cart=oeCart_(d,menu),q=oeQuote_(cart,menu),customer=oeFindCustomer_(oeCustomers_(b),d);
  if(d.lookup!=='New customer'&&(!customer||d.lookup!==customer.label))throw new Error('Load the selected customer before reviewing.');
  const priced=Object.keys(cart.items).map(code=>{const meal=menu.meals.find(m=>m.itemCode===code);return [code,cart.items[code],meal.price,meal.dishName,meal.kitchenName];});
  return {draft:d,cart:cart,menu:menu,quote:q,customer:customer,hash:oeHash_({draft:d,cycle:menu.menuCycleId,date:menu.deliveryDate,priced:priced,quote:q}),draftId:m[1]};
}
function orderEntryReview() {
  const b=oeBook_(),s=oeSheet_(b);
  oeLock_(()=>{
    const p=oePrepare_(b,s),q=p.quote;
    const requests=[oeCell_(s,5,11,p.hash),oeCell_(s,11,11,JSON.stringify({draft:p.draft,total:q.total,totalQty:q.totalQty})),oeCell_(s,20,8,oeConfirmation_(p.cart,p.menu,q,'[assigned when placed]')),oeCell_(s,16,10,'Reviewed'),oeCell_(s,14,11,q.discountPercent),oeCell_(s,15,11,q.minimumOrderItems),oeCell_(s,16,11,q.standardDeliveryFee),oeCell_(s,17,11,q.freeDeliveryThreshold),oeCell_(s,18,11,q.freeDeliveryBasis)];
    requests.push(oeMenuLookup_(s,p.menu));
    oeBatch_(b,requests);oeStatus_(b,s,'Review complete. Total '+formatMoney_(q.total)+'. Tick PLACE ORDER & SEND TO ME when ready.');
  });
}
function oeCustomerForCommit_(b,s,p) {
  let c=p.customer;
  const consent=p.draft.consent==='Keep existing'?(c&&c.consent==='Y'):p.draft.consent==='Yes';
  const changed=!c || (p.draft.consent!=='Keep existing'&&((c.consent==='Y')!==consent));
  if(!changed){if(!c.address)oeBatch_(b,[oeCell_(b.getSheetByName(CUSTOMERS_SHEET),c.row,30,p.cart.deliveryAddress)]);return c;}
  const intake=b.getSheetByName(CUSTOMER_INTAKE_SHEET),data=intake.getRange(1,1,intake.getMaxRows(),19).getValues(),header=data[0];
  if(header[0]!=='Submission ID'||header[4]!=='Mobile number'||header[8]!=='WhatsApp Contact (Yes, Ma Kitchens can contact me on WhatsApp about my free meal claim and order)')throw new Error('Customer Intake schema changed.');
  const submission='OE-'+p.draftId;
  if(changed&&!data.some(r=>r[0]===submission)){
    const phone=c?String(c.phone):'+'+p.cart.orderCustomerPhone;
    const previous=data.slice(1).filter(r=>normalisePhoneDigits_(r[4])===p.cart.orderCustomerPhone).sort((a,b)=>new Date(b[2])-new Date(a[2]))[0];
    const row=previous?previous.slice():new Array(19).fill('');
    row[0]=submission;row[1]='OE-'+p.draftId;row[2]=new Date();row[3]=p.draft.name;row[4]=phone;row[5]=c&&previous?previous[5]:p.draft.postcode;row[8]=consent;row[9]='control_tower_order';row[10]='control_tower_order';row[18]='Order Entry '+p.draftId;
    const blank=data.findIndex((r,i)=>i>0&&!r[0]);if(blank<0)throw new Error('Customer Intake is full.');
    const requests=row.map((v,i)=>oeCell_(intake,blank+1,i+1,v instanceof Date?oeSerial_(v,b):v));
    oeBatch_(b,requests);
  }
  for(let i=0;i<12;i++){
    SpreadsheetApp.flush();c=oeFindCustomer_(oeCustomers_(b),p.draft);
    if(c&&(!changed||((c.consent==='Y')===consent)))break;
    Utilities.sleep(250);
  }
  if(!c||!c.id||((c.consent==='Y')!==consent))throw new Error('Customer or consent has not recalculated yet. No order created. Retry Place order.');
  if(!c.address)oeBatch_(b,[oeCell_(b.getSheetByName(CUSTOMERS_SHEET),c.row,30,p.cart.deliveryAddress)]);
  return c;
}
function oeEmptyRows_(values,count,start,columns) {
  const rows=[];values.forEach((r,i)=>{if((columns||[0]).every(c=>r[c]===''||r[c]===undefined)&&rows.length<count)rows.push(i+start);});
  if(rows.length<count)throw new Error('Not enough empty rows. Extend the destination sheet first.');return rows;
}
function oeCommitRequests_(b,s,p,c,orderId,orderRow,itemRows) {
  const orders=b.getSheetByName(ORDERS_SHEET),items=b.getSheetByName(ORDER_ITEMS_SHEET),requests=[],serial=oeDeliverySerial_(p.menu.deliveryDate);
  const note='Order Entry draft '+p.draftId+(p.draft.instructions?' | Delivery instructions: '+p.draft.instructions:'');
  const o={1:orderId,2:oeSerial_(new Date(),b),3:serial,4:c.id,9:'Pending',10:'Payment Requested',11:DELIVERY_WINDOW,14:note,26:p.quote.discountPercent,27:p.quote.standardDeliveryFee,28:p.quote.freeDeliveryThreshold,29:p.quote.freeDeliveryBasis,30:p.quote.minimumOrderItems,31:p.cart.deliveryAddress};
  Object.keys(o).forEach(col=>requests.push(oeCell_(orders,orderRow,Number(col),o[col])));
  Object.keys(p.cart.items).forEach((code,i)=>{const meal=p.menu.meals.find(m=>m.itemCode===code);const row=itemRows[i];for(const[col,value]of [[1,orderId],[4,meal.dishName],[7,p.cart.items[code]],[14,'Pending'],[18,'Order Entry draft '+p.draftId],[23,code]])requests.push(oeCell_(items,row,col,value));});
  const confirmation=oeConfirmation_(p.cart,p.menu,p.quote,orderId);
  requests.push(oeCell_(s,3,11,'CREATED'),oeCell_(s,6,11,orderId),oeCell_(s,7,11,confirmation),oeCell_(s,8,11,'NOT_SENT'),oeCell_(s,20,8,confirmation),oeCell_(s,15,10,orderId),oeCell_(s,16,10,'Recorded; checking'));
  return requests;
}
function orderEntryPlaceOrder() {
  const b=oeBook_(),s=oeSheet_(b);let created=false;
  oeLock_(()=>{
    let m=oeMeta_(s);
    if(m[2]!=='DRAFT'){oeCheckLocked_(b,s);return;}
    const p=oePrepare_(b,s);
    if(!m[4]||m[4]!==p.hash)throw new Error('The draft, pricing or menu changed. Use Review order again before placing.');
    const orders=b.getSheetByName(ORDERS_SHEET),items=b.getSheetByName(ORDER_ITEMS_SHEET);
    if(orders.getRange(1,31).getDisplayValue()!==OE.addressHeader||items.getRange(1,23).getDisplayValue()!==OE.itemHeader)throw new Error('Run setup to install order address and item snapshots.');
    const ov=orders.getRange(2,1,orders.getMaxRows()-1,14).getDisplayValues();
    if(ov.some(r=>String(r[13]).indexOf('Order Entry draft '+p.draftId)>=0))throw new Error('This draft already appears in Orders. Check recorded order; do not submit again.');
    const orderRow=oeEmptyRows_(ov,1,2,[0,1,2,3,8,9,10,13])[0];
    const itemRows=oeEmptyRows_(items.getRange(3,1,items.getMaxRows()-2,18).getDisplayValues(),Object.keys(p.cart.items).length,3,[0,3,6,13,17]);
    const c=oeCustomerForCommit_(b,s,p),orderId=nextOrderId_(orders);
    if(oeHash_(oeDraft_(s))!==oeHash_(p.draft))throw new Error('The draft was edited during submission. Review again.');
    const requests=oeCommitRequests_(b,s,p,c,orderId,orderRow,itemRows);
    // Mark before the atomic API call. A lost response can never trigger another creation.
    oeBatch_(b,[oeCell_(s,3,11,'COMMITTING'),oeCell_(s,6,11,orderId),oeCell_(s,12,11,new Date().toISOString())]);
    try{oeBatch_(b,requests);}catch(_){throw new Error('Submission response uncertain. Use Check recorded order. Do not clear this draft.');}
    created=oeCheckLocked_(b,s);
  });
  if(created)oeSendConfirmation_(b,s,false);
}
function oeCheckLocked_(b,s) {
  const m=oeMeta_(s);if(!m[5])throw new Error('There is no recorded order for this draft.');
  const orders=b.getSheetByName(ORDERS_SHEET),rows=orders.getRange(2,1,orders.getMaxRows()-1,14).getDisplayValues();
  const matches=rows.map((r,i)=>({r:r,row:i+2})).filter(x=>x.r[0]===m[5]&&x.r[13].indexOf('Order Entry draft '+m[1])>=0);
  if(matches.length!==1){oeStatus_(b,s,'No complete matching order found. Submission needs reconciliation; no new order was created.');return false;}
  let check='',v;
  for(let i=0;i<12;i++){
    SpreadsheetApp.flush();v=orders.getRange(matches[0].row,12,1,19).getValues()[0];check=String(v[12]||'');
    if(check==='OK'&&Number(v[8])>0)break;
    Utilities.sleep(250);
  }
  const snapshot=JSON.parse(m[10]||'{}'),draft=snapshot.draft;
  const quoteTotal=Number(snapshot.total);
  if(check!=='OK'||String(v[11])!=='OK'||!Number.isFinite(quoteTotal)||Math.abs(Number(v[0])-quoteTotal)>0.011||Number(v[8])!==snapshot.totalQty||matches[0].r[8]==='Cancelled'){oeBatch_(b,[oeCell_(s,3,11,'REVIEW_REQUIRED'),oeCell_(s,16,10,'Needs review')]);oeStatus_(b,s,'Order '+m[5]+' is recorded but needs review. No confirmation sent. Check Orders and Order Items.');return false;}
  // Check the recorded order, not editable draft fields, when recovering a retry.
  const saved=m[6];if(!saved||!draft||!draft.name){oeStatus_(b,s,'Order recorded; confirmation snapshot needs reconciliation.');return false;}
  oeBatch_(b,[oeCell_(s,3,11,'CREATED'),oeCell_(s,16,10,'Pending payment')]);
  oeStatus_(b,s,m[5]+' recorded successfully. Confirmation '+(m[7]||'NOT_SENT')+'.');return true;
}
function orderEntryCheckOrder() {const b=oeBook_(),s=oeSheet_(b);oeLock_(()=>oeCheckLocked_(b,s));}
function orderEntryRecoverSubmission() {
  const b=oeBook_(),s=oeSheet_(b);
  oeLock_(()=>{
    const m=oeMeta_(s);if(m[2]!=='COMMITTING')throw new Error('Use Check recorded order. This action only recovers an uncertain submission.');
    const age=Date.now()-Date.parse(m[11]);if(!Number.isFinite(age)||age<420000)throw new Error('Wait seven minutes after the attempt so the previous execution has ended, then check again.');
    const orders=b.getSheetByName(ORDERS_SHEET),items=b.getSheetByName(ORDER_ITEMS_SHEET);
    const rows=orders.getRange(2,1,orders.getMaxRows()-1,14).getDisplayValues();
    if(rows.some(r=>r[0]===m[5]||String(r[13]).indexOf('Order Entry draft '+m[1])>=0)){oeCheckLocked_(b,s);return;}
    const itemRows=items.getRange(3,1,items.getMaxRows()-2,18).getDisplayValues();
    if(itemRows.some(r=>r[0]===m[5]||String(r[17]).indexOf('Order Entry draft '+m[1])>=0))throw new Error('Order items exist. Reconcile them before retrying.');
    oeBatch_(b,[oeCell_(s,3,11,'DRAFT'),oeCell_(s,5,11,''),oeCell_(s,6,11,''),oeCell_(s,16,10,'Draft')]);
    oeStatus_(b,s,'No order or items were recorded. Draft restored. Review again before placing.');
  });
}
function oeSendConfirmation_(b,s,resend) {
  let text='',draftId='',attemptId='';
  oeLock_(()=>{
    if(!oeCheckLocked_(b,s))throw new Error('Recorded order needs review.');
    const m=oeMeta_(s);
    if(m[7]==='SENDING'||m[7]==='UNCERTAIN')throw new Error('Confirmation delivery is uncertain. Check your WhatsApp before any resend.');
    if(m[7]==='ACCEPTED'&&!resend){oeStatus_(b,s,'Confirmation was already accepted. No duplicate sent.');return;}
    text=m[6];if(!text||text.length>4096)throw new Error('Confirmation is too long for WhatsApp. Copy it from the tab.');
    draftId=m[1];attemptId=Utilities.getUuid();
    oeBatch_(b,[oeCell_(s,8,11,'SENDING'),oeCell_(s,9,11,attemptId),oeCell_(s,13,11,new Date().toISOString())]);
  });
  if(!text)return;
  let result;
  try{result=oeSendText_(text);}catch(_){oeLock_(()=>{const m=oeMeta_(s);if(m[1]!==draftId||m[8]!==attemptId)throw new Error('Confirmation attempt changed. Check recorded order.');oeBatch_(b,[oeCell_(s,8,11,'UNCERTAIN')]);oeStatus_(b,s,'Order saved. Confirmation response uncertain. Check WhatsApp; do not recreate the order.');});return;}
  oeLock_(()=>{
    const m=oeMeta_(s);if(m[1]!==draftId||m[8]!==attemptId)throw new Error('Confirmation attempt changed. Check recorded order.');
    oeBatch_(b,[oeCell_(s,8,11,result.id?'ACCEPTED':'FAILED'),oeCell_(s,9,11,result.id||'')]);
    oeStatus_(b,s,result.id?'Order saved. Confirmation accepted for your WhatsApp.':('Order saved. WhatsApp rejected the confirmation'+(result.code?' (code '+result.code+')':'')+'. Copy the preview, or open your WhatsApp conversation and use Resend confirmation.'));
  });
}
function oeSendText_(text) {
  const props=PropertiesService.getScriptProperties(),token=props.getProperty('WHATSAPP_ACCESS_TOKEN'),phone=props.getProperty('WHATSAPP_PHONE_NUMBER_ID'),version=props.getProperty('GRAPH_API_VERSION')||'v26.0';
  if(!token||!/^\d+$/.test(phone||'')||!/^v\d+\.\d+$/.test(version))throw new Error('WhatsApp configuration missing.');
  const response=UrlFetchApp.fetch('https://graph.facebook.com/'+version+'/'+phone+'/messages',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token},payload:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:OE.ownerPhone,type:'text',text:{body:text}}),muteHttpExceptions:true});
  const code=response.getResponseCode();let data;try{data=JSON.parse(response.getContentText());}catch(_){throw new Error('Provider response uncertain.');}
  const id=data.messages&&data.messages[0]&&data.messages[0].id;
  if(code>=200&&code<300){if(typeof id!=='string'||!id)throw new Error('Provider acceptance uncertain.');return {id:id};}
  if(code>=500)throw new Error('Provider response uncertain.');
  return {id:'',code:data.error&&Number(data.error.code)||code};
}
function orderEntryResendConfirmation() {
  const b=oeBook_(),s=oeSheet_(b),ui=SpreadsheetApp.getUi(),m=oeMeta_(s);
  if(!m[5])throw new Error('There is no recorded order.');
  if(ui.alert('Resend confirmation','Send the saved confirmation for '+m[5]+' to YOUR WhatsApp number? Check whether it already arrived first. This does not create an order.',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
  oeLock_(()=>{
    const current=oeMeta_(s);if(current[5]!==m[5])throw new Error('Draft changed.');
    if(current[7]==='SENDING'||current[7]==='UNCERTAIN'){
      const age=Date.now()-Date.parse(current[12]);
      if(!Number.isFinite(age)||age<420000)throw new Error('Wait seven minutes after the send attempt and check WhatsApp before retrying.');
      oeBatch_(b,[oeCell_(s,8,11,'FAILED')]);
    }
  });
  oeSendConfirmation_(b,s,true);
}


function oeMenuForDate_(ymd) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ymd||''))throw new Error('Choose a delivery date using the calendar.');
  const spreadsheet =
    SpreadsheetApp.openById(
      CONTROL_TOWER_SPREADSHEET_ID
    );

  const timeZone =
    spreadsheet.getSpreadsheetTimeZone() ||
    'Australia/Sydney';

  const weeklyMenuSheet =
    spreadsheet.getSheetByName(
      WEEKLY_MENU_SHEET
    );

  const dishesSheet =
    spreadsheet.getSheetByName(
      DISHES_SHEET
    );

  if (!weeklyMenuSheet) {
    throw new Error(
      'Weekly Menu sheet not found.'
    );
  }

  if (!dishesSheet) {
    throw new Error(
      'Dishes sheet not found.'
    );
  }

  const weeklyRange =
    weeklyMenuSheet.getDataRange();

  const weeklyValues =
    weeklyRange.getValues();

  const weeklyDisplay =
    weeklyRange.getDisplayValues();

  if (weeklyValues.length < 2) {
    return {
      status: 'NO_ACTIVE_MENU',
      meals: []
    };
  }

  const headers = weeklyValues[0]
    .map(value =>
      String(value).trim()
    );

  const column = {};

  headers.forEach(
    (header, index) => {
      column[header] = index;
    }
  );

  const requiredWeeklyColumns = [
    'Menu Cycle ID',
    'Delivery Date',
    'Item Code',
    'Dish Name',
    'Menu Kitchen Name',
    'Customer Price',
    'Menu Description',
    'Image URL',
    'Cook Section Order',
    'Dish Display Order',
    'Remaining Servings',
    'Menu Status',
    'Availability Status',
    'Menu Card Readiness'
  ];

  requiredWeeklyColumns.forEach(
    header => {
      if (column[header] === undefined) {
        throw new Error(
          'Missing Weekly Menu column: ' +
          header
        );
      }
    }
  );

  const dishValues =
    dishesSheet.getDataRange()
      .getValues();

  const dishHeaders = dishValues[0]
    .map(value =>
      String(value).trim()
    );

  const dishColumn = {};

  dishHeaders.forEach(
    (header, index) => {
      dishColumn[header] = index;
    }
  );

  if (
    dishColumn['Item Code'] === undefined ||
    dishColumn['Portion / Pack'] === undefined
  ) {
    throw new Error(
      'Required Dishes columns not found.'
    );
  }

  const portionByItemCode = {};
  const cookPayByItemCode = {};

  for (
    let rowIndex = 1;
    rowIndex < dishValues.length;
    rowIndex++
  ) {
    const row = dishValues[rowIndex];

    const itemCode = String(
      row[
        dishColumn['Item Code']
      ] || ''
    ).trim();

    if (!itemCode) {
      continue;
    }

    portionByItemCode[itemCode] =
      String(
        row[
          dishColumn['Portion / Pack']
        ] || ''
      ).trim();

    if (dishColumn['Cook Pay / Serving'] !== undefined) {
      cookPayByItemCode[itemCode] = Number(
        row[dishColumn['Cook Pay / Serving']] || 0
      );
    }
  }

  const today = new Date();
  const todayYmd=Utilities.formatDate(today,timeZone,'yyyy-MM-dd');

  const eligibleRows = [];

  for (
    let rowIndex = 1;
    rowIndex < weeklyValues.length;
    rowIndex++
  ) {
    const row = weeklyValues[rowIndex];

    const menuStatus = String(
      row[column['Menu Status']] || ''
    ).trim();

    const availabilityStatus = String(
      row[column['Availability Status']] || ''
    ).trim();

    const readiness = String(
      row[column['Menu Card Readiness']] || ''
    ).trim();

    const remaining = Number(
      row[column['Remaining Servings']] || 0
    );

    if (
      menuStatus !== 'Available' ||
      availabilityStatus !== 'Available' ||
      readiness !== 'READY' ||
      remaining <= 0
    ) {
      continue;
    }

    const deliveryValue =
      row[column['Delivery Date']];

    let deliveryDate;

    if (deliveryValue instanceof Date) {
      deliveryDate = new Date(
        deliveryValue.getTime()
      );
    } else {
      deliveryDate = new Date(
        deliveryValue
      );
    }

    if (isNaN(deliveryDate.getTime())) {
      continue;
    }

    if (Utilities.formatDate(deliveryDate,timeZone,'yyyy-MM-dd') < todayYmd) {
      continue;
    }

    eligibleRows.push({
      rowIndex: rowIndex,
      row: row,
      deliveryDate: deliveryDate
    });
  }

  if (eligibleRows.length === 0) {
    return {
      status: 'NO_ACTIVE_MENU',
      meals: []
    };
  }

  const menuRows = eligibleRows.filter(item => Utilities.formatDate(item.deliveryDate,timeZone,'yyyy-MM-dd')===ymd);
  if(!menuRows.length)return {status:'NO_ACTIVE_MENU',meals:[]};
  const cycles=[...new Set(menuRows.map(item=>String(item.row[column['Menu Cycle ID']]||'').trim()))];
  if(cycles.length!==1||!cycles[0])throw new Error('Multiple or missing menu cycles for this delivery date.');
  const nextDeliveryTime=menuRows[0].deliveryDate.getTime();

  menuRows.sort(
    (a, b) => {
      const aSection = Number(
        a.row[
          column['Cook Section Order']
        ] || 999
      );

      const bSection = Number(
        b.row[
          column['Cook Section Order']
        ] || 999
      );

      if (aSection !== bSection) {
        return aSection - bSection;
      }

      const aDish = Number(
        a.row[
          column['Dish Display Order']
        ] || 999
      );

      const bDish = Number(
        b.row[
          column['Dish Display Order']
        ] || 999
      );

      return aDish - bDish;
    }
  );

  const meals = menuRows.map(
    item => {
      const row = item.row;
      const displayRow =
        weeklyDisplay[item.rowIndex];

      const itemCode = String(
        row[column['Item Code']] || ''
      ).trim();

      return {
        id: itemCode,
        itemCode: itemCode,
        kitchenName: String(
          row[
            column['Menu Kitchen Name']
          ] || ''
        ).trim(),
        dishName: String(
          row[column['Dish Name']] || ''
        ).trim(),
        description: String(
          row[
            column['Menu Description']
          ] || ''
        ).trim(),
        portion:
          portionByItemCode[itemCode] || '',
        price: Number(
          row[
            column['Customer Price']
          ] || 0
        ),
        cookPay: Number(
          cookPayByItemCode[itemCode] || 0
        ),
        priceDisplay: String(
          displayRow[
            column['Customer Price']
          ] || ''
        ).trim(),
        imageUrl: String(
          row[column['Image URL']] || ''
        ).trim(),
        remainingServings: Number(
          row[
            column['Remaining Servings']
          ] || 0
        )
      };
    }
  );

  const deliveryDate =
    new Date(nextDeliveryTime);

  const orderDeadline =
    new Date(nextDeliveryTime);

  orderDeadline.setDate(
    orderDeadline.getDate() - 2
  );

  orderDeadline.setHours(
    20,
    0,
    0,
    0
  );

  const firstMenuRow =
    menuRows[0].row;

  return {
    status: 'ACTIVE',
    menuCycleId: String(
      firstMenuRow[
        column['Menu Cycle ID']
      ] || ''
    ).trim(),
    deliveryDate:
      Utilities.formatDate(
        deliveryDate,
        timeZone,
        'yyyy-MM-dd'
      ),
    deliveryDateDisplay:
      Utilities.formatDate(
        deliveryDate,
        timeZone,
        'EEE d MMM'
      ),
    orderDeadline:
      Utilities.formatDate(
        orderDeadline,
        timeZone,
        "yyyy-MM-dd'T'HH:mm:ss"
      ),
    orderDeadlineDisplay:
      Utilities.formatDate(
        orderDeadline,
        timeZone,
        'EEE d MMM, h:mm a'
      ),
    mealCount: meals.length,
    meals: meals
  };
}

function oeDate_(value,timeZone) {
  if(value instanceof Date && !isNaN(value.getTime()))return Utilities.formatDate(value,timeZone||'Australia/Sydney','yyyy-MM-dd');
  if(typeof value==='number'&&Number.isFinite(value))return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  const text=String(value||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)&&new Date(text+'T00:00:00Z').toISOString().slice(0,10)===text)return text;
  throw new Error('Choose a delivery date using the calendar.');
}
function oeControls_(s) {
  const id=s.getSheetId(),range=(r,c,rows,cols)=>({sheetId:id,startRowIndex:r-1,endRowIndex:r-1+rows,startColumnIndex:c-1,endColumnIndex:c-1+cols});
  const requests=[{unmergeCells:{range:range(43,1,3,10)}},{mergeCells:{range:range(45,8,1,3),mergeType:'MERGE_ALL'}}];
  for(const [row,col,end,label]of [[43,1,3,'REVIEW ORDER'],[43,4,6,'PLACE ORDER & SEND TO ME'],[43,8,10,'CHECK ORDER'],[45,1,6,'NEW DRAFT: CLEAR INPUTS']]){
    requests.push({mergeCells:{range:range(row,col+1,1,end-col),mergeType:'MERGE_ALL'}},oeCell_(s,row,col,false),oeCell_(s,row,col+1,label));
    requests.push({setDataValidation:{range:range(row,col,1,1),rule:{condition:{type:'BOOLEAN'},strict:true,showCustomUi:true}}});
    requests.push({repeatCell:{range:range(row,col,1,end-col+1),cell:{userEnteredFormat:{backgroundColor:{red:0.788,green:0.416,blue:0.29},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}},verticalAlignment:'MIDDLE',wrapStrategy:'WRAP'}},fields:'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy'}});
  }
  requests.push(oeCell_(s,45,8,'Resend: use Order Entry menu'),oeCell_(s,46,1,'Tick REVIEW ORDER, check the preview, then tick PLACE ORDER & SEND TO ME. NEW DRAFT clears entered details.'));
  requests.push({repeatCell:{range:range(16,3,1,4),cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'ddd d mmm yyyy'}}},fields:'userEnteredFormat.numberFormat'}},{setDataValidation:{range:range(16,3,1,4),rule:{condition:{type:'DATE_IS_VALID'},strict:true,showCustomUi:true,inputMessage:'Double-click to choose a published delivery date from the calendar.'}}});
  requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:42,endIndex:43},properties:{pixelSize:44},fields:'pixelSize'}},{updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:44,endIndex:45},properties:{pixelSize:36},fields:'pixelSize'}});
  return requests;
}
function oeQuantityRules_(s,rows) {
  const lookup=s.getRange('N2:R1001').getValues(),limits={};lookup.forEach(r=>{if(r[0])limits[r[0]]=Number(r[4]);});
  const labels=rows||s.getRange('B21:B40').getDisplayValues().map(r=>r[0]);
  return Array.from({length:20},(_,i)=>{
    const limit=labels[i]?Math.max(1,Math.floor(limits[labels[i]]||1)):50;
    return {setDataValidation:{range:{sheetId:s.getSheetId(),startRowIndex:20+i,endRowIndex:21+i,startColumnIndex:3,endColumnIndex:4},rule:{condition:{type:'ONE_OF_LIST',values:Array.from({length:Math.min(limit,500)},(_,j)=>({userEnteredValue:String(j+1)}))},strict:limit<=500,showCustomUi:true,inputMessage:'Choose a whole-number quantity. Availability is checked again before placing.'}}};
  });
}
function oeChangeDate_(b,s) {
  oeLock_(()=>{
    if(oeMeta_(s)[2]!=='DRAFT')throw new Error('Start a new draft before changing the delivery date.');
    const ymd=oeDate_(s.getRange('C16').getValue(),b.getSpreadsheetTimeZone()),menu=oeMenuForDate_(ymd);
    const requests=[oeCell_(s,5,11,''),oeCell_(s,16,10,'Draft'),oeMenuLookup_(s,menu)];
    if(menu.status!=='ACTIVE'){
      requests.push(oeCell_(s,4,11,JSON.stringify({deliveryDate:ymd})),oeCell_(s,20,8,'No available published menu for this date. Choose another date.'));
      oeBatch_(b,requests);oeStatus_(b,s,'No available published menu for '+ymd+'. Choose another delivery date.');return;
    }
    const labels=new Set(menu.meals.map(oeLabel_)),old=s.getRange('B21:D40').getDisplayValues();let removed=0;
    old.forEach((r,i)=>{if(r[0]&&!labels.has(r[0])){requests.push(oeCell_(s,21+i,2,''),oeCell_(s,21+i,4,''));removed++;}});
    requests.push(oeCell_(s,4,11,JSON.stringify({menuCycleId:menu.menuCycleId,deliveryDate:ymd})),oeCell_(s,20,8,'Menu updated for '+menu.deliveryDateDisplay+'. Review before placing.'));
    oeBatch_(b,requests);oeBatch_(b,oeQuantityRules_(s));
    oeStatus_(b,s,'Menu loaded for '+menu.deliveryDateDisplay+'. '+(removed?removed+' dish rows from another menu were cleared.':'Customer details and matching dishes preserved.'));
  });
}
function orderEntryEdited(e) {
  if(!e||!e.range||!e.source||e.source.getId()!==CONTROL_TOWER_SPREADSHEET_ID||e.range.getSheet().getName()!==OE.sheet)return;
  const row=e.range.getRow(),col=e.range.getColumn();
  const input=(row>=7&&row<=16&&col>=3&&col<=6)||(row>=21&&row<=40&&col>=2&&col<=4);
  const control=e.range.getNumRows()===1&&e.range.getNumColumns()===1&&((row===43&&[1,4,8].includes(col))||(row===45&&col===1));
  if(!input&&!control)return;
  const b=e.source,s=e.range.getSheet();
  try{
    const owner=b.getOwner(),editor=e.user&&e.user.getEmail();
    if(!owner||!editor||editor!==owner.getEmail())throw new Error('Editor identity could not be verified as the owner. Use the Order Entry menu while signed in as the owner.');
    oeBook_();
    if(control){
      if(e.value!=='TRUE'||e.range.getValue()!==true)return;
      oeBatch_(b,[oeCell_(s,row,col,false)]);
      if(row===45)return oeNewDraft_(true);
      if(col===1)return orderEntryReview();
      if(col===4)return orderEntryPlaceOrder();
      return orderEntryCheckOrder();
    }
    if(row===7&&col===3&&e.range.getNumRows()===1)return orderEntryLoadCustomer();
    if(row===16&&col===3&&e.range.getNumRows()===1)return oeChangeDate_(b,s);
    oeLock_(()=>{if(oeMeta_(s)[2]==='DRAFT'){const requests=[oeCell_(s,5,11,''),oeCell_(s,16,10,'Draft')];if(row>=21&&row<=40&&col===2)requests.push(...oeQuantityRules_(s));oeBatch_(b,requests);}});
  }catch(err){if(control)oeBatch_(b,[oeCell_(s,row,col,false)]);oeStatus_(b,s,String(err.message||'Order Entry action failed. Check the draft before retrying.'));}
}

function oeCustomerAddressFields_(c) {
  let street=String(c.address||'').trim();const suburb=String(c.suburb||'').trim(),postcode=String(c.postcode||'').trim();
  if(postcode&&street.endsWith(postcode))street=street.slice(0,-postcode.length).replace(/[ ,]+$/,'');
  if(suburb&&street.toLowerCase().endsWith(suburb.toLowerCase()))street=street.slice(0,-suburb.length).replace(/[ ,]+$/,'');
  return {street:street,suburb:suburb};
}
