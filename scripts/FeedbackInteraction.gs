const FEEDBACK_INTERACTION_FEEDBACK_SHEET = 'Feedback';
const FEEDBACK_INTERACTION_DELIVERIES_SHEET = 'Deliveries';
const FEEDBACK_INTERACTION_ORDER_ITEMS_SHEET = 'Order Items';
const FEEDBACK_INTERACTION_ORDERS_SHEET = 'Orders';
const FEEDBACK_INTERACTION_CUSTOMERS_SHEET = 'Customers';
const FEEDBACK_INTERACTION_DISHES_SHEET = 'Dishes';


/* =========================================================
   FEEDBACK REASON DIAGNOSTICS
   Script Properties only. No spreadsheet writes.
   ========================================================= */

const FEEDBACK_REASON_DIAGNOSTIC_PROPERTY =
  'FEEDBACK_REASON_DIAGNOSTIC_LOG';

function feedbackReasonDiagnostic_(event) {
  // Do not persist user text, reply parts, recipient, tokens or error stacks.
  try {
    const props = fwProps_(); let entries;
    try { entries = JSON.parse(props.getProperty(FEEDBACK_REASON_DIAGNOSTIC_PROPERTY) || '[]'); } catch (_) { entries = []; }
    if (!Array.isArray(entries)) entries = [];
    const clean = value => ({ recordedAt: typeof value.recordedAt === 'string' && Number.isFinite(fwTime_(value.recordedAt)) ? value.recordedAt : new Date().toISOString(),
      stage: typeof value.stage === 'string' && /^[A-Z_]{1,40}$/.test(value.stage) ? value.stage : 'UNKNOWN',
      orderId: typeof value.orderId === 'string' && /^ORD-\d{1,20}$/.test(value.orderId) ? value.orderId : '', allowed: value.allowed === true });
    entries = entries.filter(fwObject_).map(clean); entries.push(clean(event || {}));
    props.setProperty(FEEDBACK_REASON_DIAGNOSTIC_PROPERTY, JSON.stringify(entries.slice(-30)));
  } catch (_) {} // Logging failure never echoes exception text.
}


function getRecentFeedbackReasonDiagnostics() {
  let entries; try { entries = JSON.parse(fwProps_().getProperty(FEEDBACK_REASON_DIAGNOSTIC_PROPERTY) || '[]'); } catch (_) { entries = []; }
  if (!Array.isArray(entries)) entries = [];
  const safe = entries.filter(fwObject_).map(e => ({ recordedAt: Number.isFinite(fwTime_(e.recordedAt)) ? e.recordedAt : '',
    stage: typeof e.stage === 'string' && /^[A-Z_]{1,40}$/.test(e.stage) ? e.stage : 'UNKNOWN',
    orderId: typeof e.orderId === 'string' && /^ORD-\d{1,20}$/.test(e.orderId) ? e.orderId : '', allowed: e.allowed === true }));
  return { count: safe.length, events: safe };
}


function clearFeedbackReasonDiagnostics() {
  PropertiesService
    .getScriptProperties()
    .deleteProperty(
      FEEDBACK_REASON_DIAGNOSTIC_PROPERTY
    );

  const result = {
    cleared: true
  };

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}



/* =========================================================
   ENTRY POINTS CALLED BY THE MAIN WHATSAPP ROUTER
   ========================================================= */

function handleFeedbackTemplateReply_(recipient, payload, message) {
  const value = String(payload || '').trim();

  if (value.indexOf('FEEDBACK|') !== 0) {
    return false;
  }

  const parts = value.split('|');

  if (parts.length !== 2) {
    return true;
  }

  const orderId = String(parts[1] || '').trim();

  if (!/^ORD-\d+$/.test(orderId)) {
    return true;
  }

  const access = feedbackInteractionVerifyOrderAccess_(
    recipient,
    orderId
  );

  if (!access.allowed) {
    console.log(
      'Feedback start blocked for ' +
      orderId +
      ': ' +
      access.reason
    );

    return true;
  }

  if (access.feedbackStatus === 'Completed') {
    sendTextMessage_(
      recipient,
      'Thanks. Your feedback for this order has already been completed.'
    );

    return true;
  }

  feedbackInteractionClearPendingCommentState_(recipient);

  feedbackInteractionSetDeliveryFeedbackStatus_(
    orderId,
    'In Progress',
    false
  );

  const items = feedbackInteractionGetOrderItems_(orderId);

  if (!items.length) {
    sendTextMessage_(
      recipient,
      'Sorry, I could not find the meals for this order. Please message Ma Kitchens and we will help you.'
    );

    return true;
  }

  feedbackInteractionSendNextDish_(
    recipient,
    orderId
  );

  return true;
}


function handleFeedbackInteractiveReply_(recipient, replyId, message) {
  const id = String(replyId || '').trim();

  if (
    id.indexOf('FBRATE|') !== 0 &&
    id.indexOf('FBREASON|') !== 0 &&
    id.indexOf('FBDELIVERY|') !== 0
  ) {
    return false;
  }

  const parts = id.split('|');

  if (id.indexOf('FBRATE|') === 0) {
    feedbackInteractionHandleDishRating_(
      recipient,
      parts,
      message
    );

    return true;
  }

  if (id.indexOf('FBREASON|') === 0) {
    feedbackInteractionHandleDishReason_(
      recipient,
      parts,
      message
    );

    return true;
  }

  if (id.indexOf('FBDELIVERY|') === 0) {
    feedbackInteractionHandleDeliveryRating_(
      recipient,
      parts,
      message
    );

    return true;
  }

  return false;
}


/* =========================================================
   DISH RATING FLOW
   ========================================================= */

function feedbackInteractionSendNextDish_(recipient, orderId) {
  const access = feedbackInteractionVerifyOrderAccess_(
    recipient,
    orderId
  );

  if (!access.allowed) {
    return;
  }

  const items = feedbackInteractionGetOrderItems_(orderId);
  const completedItemCodes = feedbackInteractionGetCompletedItemCodes_(
    orderId
  );

  const nextItem = items.find(item => {
    return !completedItemCodes[item.itemCode];
  });

  if (!nextItem) {
    feedbackInteractionSendDeliveryRating_(
      recipient,
      orderId
    );

    return;
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
        text: 'Rate your meal'
      },
      body: {
        text:
          'How was ' +
          nextItem.dishName +
          '?'
      },
      action: {
        button: 'Choose rating',
        sections: [
          {
            title: 'Your rating',
            rows: [
              {
                id:
                  'FBRATE|' +
                  orderId +
                  '|' +
                  nextItem.itemCode +
                  '|5',
                title: '5 - Excellent'
              },
              {
                id:
                  'FBRATE|' +
                  orderId +
                  '|' +
                  nextItem.itemCode +
                  '|4',
                title: '4 - Good'
              },
              {
                id:
                  'FBRATE|' +
                  orderId +
                  '|' +
                  nextItem.itemCode +
                  '|3',
                title: '3 - Okay'
              },
              {
                id:
                  'FBRATE|' +
                  orderId +
                  '|' +
                  nextItem.itemCode +
                  '|2',
                title: '2 - Poor'
              },
              {
                id:
                  'FBRATE|' +
                  orderId +
                  '|' +
                  nextItem.itemCode +
                  '|1',
                title: '1 - Very poor'
              },
              {
                id:
                  'FBRATE|' +
                  orderId +
                  '|' +
                  nextItem.itemCode +
                  '|SKIP',
                title: "Didn't try this"
              }
            ]
          }
        ]
      }
    }
  };

  sendWhatsAppPayload_(payload);
}


function feedbackInteractionHandleDishRating_(recipient, parts, message) {
  if (parts.length !== 4) {
    return;
  }

  const orderId = String(parts[1] || '').trim();
  const itemCode = String(parts[2] || '').trim();
  const ratingValue = String(parts[3] || '').trim();

  const access = feedbackInteractionVerifyOrderAccess_(
    recipient,
    orderId
  );

  if (!access.allowed) {
    return;
  }

  const item = feedbackInteractionGetOrderItems_(orderId)
    .find(candidate => candidate.itemCode === itemCode);

  if (!item) {
    return;
  }

  if (ratingValue === 'SKIP') {
    feedbackInteractionSaveFeedback_(
      orderId,
      access.customerId,
      item,
      '',
      "Didn't try this",
      'None',
      message
    );

    feedbackInteractionSendNextDish_(
      recipient,
      orderId
    );

    return;
  }

  const rating = Number(ratingValue);

  if (![1, 2, 3, 4, 5].includes(rating)) {
    return;
  }

  if (rating >= 4) {
    feedbackInteractionSaveFeedback_(
      orderId,
      access.customerId,
      item,
      rating,
      '',
      'None',
      message
    );

    feedbackInteractionSendNextDish_(
      recipient,
      orderId
    );

    return;
  }

  feedbackInteractionSendReasonList_(
    recipient,
    orderId,
    item,
    rating
  );
}


function feedbackInteractionSendReasonList_(
  recipient,
  orderId,
  item,
  rating
) {
  const rows =
    rating === 3
      ? [
          ['TASTE', 'Taste'],
          ['PORTION', 'Portion size'],
          ['FRESHNESS', 'Freshness'],
          ['PACKAGING', 'Packaging'],
          ['VALUE', 'Value for money'],
          ['OTHER', 'Other']
        ]
      : [
          ['TASTE', 'Taste'],
          ['QUALITY', 'Food quality'],
          ['PORTION', 'Portion size'],
          ['PACKAGING', 'Packaging'],
          ['WRONG_ITEM', 'Wrong or missing item'],
          ['OTHER', 'Other']
        ];

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text:
          rating === 3
            ? 'Help us improve'
            : 'What went wrong?'
      },
      body: {
        text:
          rating === 3
            ? 'What could have made ' +
              item.dishName +
              ' better?'
            : 'What was the main issue with ' +
              item.dishName +
              '?'
      },
      action: {
        button: 'Choose reason',
        sections: [
          {
            title: 'Main reason',
            rows: rows.map(row => ({
              id:
                'FBREASON|' +
                orderId +
                '|' +
                item.itemCode +
                '|' +
                rating +
                '|' +
                row[0],
              title: row[1]
            }))
          }
        ]
      }
    }
  };

  sendWhatsAppPayload_(payload);
}


function feedbackInteractionHandleDishReason_(recipient, parts, message) {
  const rawParts = Array.isArray(parts)
    ? parts.map(value => String(value || ''))
    : [];

  const incomingMessageId = String(
    message && message.id
      ? message.id
      : ''
  ).trim();

  feedbackReasonDiagnostic_({
    stage: 'ENTER',
    recipient: String(recipient || ''),
    messageId: incomingMessageId,
    parts: rawParts
  });

  try {
    if (parts.length !== 5) {
      feedbackReasonDiagnostic_({
        stage: 'STOP_INVALID_PART_COUNT',
        messageId: incomingMessageId,
        partCount: parts.length,
        parts: rawParts
      });
      return;
    }

    const orderId = String(parts[1] || '').trim();
    const itemCode = String(parts[2] || '').trim();
    const rating = Number(parts[3]);
    const reasonCode = String(parts[4] || '').trim();

    feedbackReasonDiagnostic_({
      stage: 'PARSED',
      messageId: incomingMessageId,
      orderId: orderId,
      itemCode: itemCode,
      rating: rating,
      reasonCode: reasonCode
    });

    if (![1, 2, 3].includes(rating)) {
      feedbackReasonDiagnostic_({
        stage: 'STOP_INVALID_RATING',
        messageId: incomingMessageId,
        orderId: orderId,
        itemCode: itemCode,
        rating: rating,
        reasonCode: reasonCode
      });
      return;
    }

    const access = feedbackInteractionVerifyOrderAccess_(
      recipient,
      orderId
    );

    feedbackReasonDiagnostic_({
      stage: 'ACCESS_CHECK',
      messageId: incomingMessageId,
      orderId: orderId,
      itemCode: itemCode,
      rating: rating,
      reasonCode: reasonCode,
      allowed: !!access.allowed,
      accessReason: access.reason || ''
    });

    if (!access.allowed) {
      return;
    }

    const item = feedbackInteractionGetOrderItems_(orderId)
      .find(candidate => candidate.itemCode === itemCode);

    feedbackReasonDiagnostic_({
      stage: 'ITEM_LOOKUP',
      messageId: incomingMessageId,
      orderId: orderId,
      itemCode: itemCode,
      rating: rating,
      reasonCode: reasonCode,
      itemFound: !!item,
      dishName: item ? item.dishName : ''
    });

    if (!item) {
      return;
    }

    const reasonMap = {
      TASTE: 'Taste',
      QUALITY: 'Food quality',
      PORTION: 'Portion size',
      FRESHNESS: 'Freshness',
      PACKAGING: 'Packaging',
      VALUE: 'Value for money',
      WRONG_ITEM: 'Wrong or missing item',
      OTHER: 'Other'
    };

    const reason =
      reasonMap[reasonCode] ||
      reasonCode ||
      'Other';

    feedbackInteractionSaveFeedback_(
      orderId,
      access.customerId,
      item,
      rating,
      reason,
      'Open',
      message
    );

    feedbackReasonDiagnostic_({
      stage: 'FEEDBACK_SAVED',
      messageId: incomingMessageId,
      orderId: orderId,
      itemCode: itemCode,
      rating: rating,
      reasonCode: reasonCode,
      reason: reason
    });

    if (reasonCode === 'OTHER') {
      feedbackInteractionSetPendingCommentState_(
        recipient,
        {
          mode: 'DISH_OTHER',
          orderId: orderId,
          itemCode: itemCode,
          dishName: item.dishName
        }
      );

      sendTextMessage_(
        recipient,
        'If you would like, please tell us a little more about what could be improved with ' +
          item.dishName +
          '. Reply with a short comment, or type SKIP to continue.'
      );

      feedbackReasonDiagnostic_({
        stage: 'WAITING_FOR_OTHER_COMMENT',
        messageId: incomingMessageId,
        orderId: orderId,
        itemCode: itemCode,
        rating: rating,
        reasonCode: reasonCode
      });

      return;
    }

    feedbackInteractionSendNextDish_(
      recipient,
      orderId
    );

    feedbackReasonDiagnostic_({
      stage: 'NEXT_STEP_REQUESTED',
      messageId: incomingMessageId,
      orderId: orderId,
      itemCode: itemCode,
      rating: rating,
      reasonCode: reasonCode
    });
  } catch (err) {
    feedbackReasonDiagnostic_({
      stage: 'ERROR',
      messageId: incomingMessageId,
      parts: rawParts,
      error:
        err && err.message
          ? err.message
          : String(err || 'Unknown error'),
      stack:
        err && err.stack
          ? String(err.stack)
          : ''
    });

    throw err;
  }
}


/* =========================================================
   DELIVERY RATING + COMPLETION
   ========================================================= */

function feedbackInteractionSendDeliveryRating_(recipient, orderId) {
  const completed = feedbackInteractionHasFeedbackItem_(
    orderId,
    'DELIVERY'
  );

  if (completed) {
    feedbackInteractionComplete_(
      recipient,
      orderId
    );

    return;
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
        text: 'Delivery feedback'
      },
      body: {
        text: 'How was your Ma Kitchens delivery experience?'
      },
      action: {
        button: 'Choose rating',
        sections: [
          {
            title: 'Delivery rating',
            rows: [5, 4, 3, 2, 1].map(rating => ({
              id:
                'FBDELIVERY|' +
                orderId +
                '|' +
                rating,
              title:
                rating +
                (rating === 5
                  ? ' - Excellent'
                  : rating === 4
                    ? ' - Good'
                    : rating === 3
                      ? ' - Okay'
                      : rating === 2
                        ? ' - Poor'
                        : ' - Very poor')
            }))
          }
        ]
      }
    }
  };

  sendWhatsAppPayload_(payload);
}


function feedbackInteractionHandleDeliveryRating_(recipient, parts, message) {
  if (parts.length !== 3) {
    return;
  }

  const orderId = String(parts[1] || '').trim();
  const rating = Number(parts[2]);

  if (![1, 2, 3, 4, 5].includes(rating)) {
    return;
  }

  const access = feedbackInteractionVerifyOrderAccess_(
    recipient,
    orderId
  );

  if (!access.allowed) {
    return;
  }

  feedbackInteractionSaveFeedback_(
    orderId,
    access.customerId,
    {
      itemCode: 'DELIVERY',
      dishName: 'Delivery',
      cookId: ''
    },
    rating,
    '',
    rating <= 3
      ? 'Open'
      : 'None',
    message
  );

  /*
    The rating itself is enough to complete the operational
    feedback workflow. Optional comments must never leave an
    order stuck In Progress.
  */
  feedbackInteractionSetDeliveryFeedbackStatus_(
    orderId,
    'Completed',
    true
  );

  if (rating <= 3) {
    feedbackInteractionSetPendingCommentState_(
      recipient,
      {
        mode: 'DELIVERY_LOW',
        orderId: orderId,
        itemCode: 'DELIVERY',
        dishName: 'Delivery'
      }
    );

    sendTextMessage_(
      recipient,
      'Thanks for letting us know. What could we improve about the delivery? Reply with a short comment, or type SKIP.'
    );

    return;
  }

  feedbackInteractionOfferFinalComment_(
    recipient,
    orderId
  );
}


function feedbackInteractionComplete_(recipient, orderId) {
  feedbackInteractionSetDeliveryFeedbackStatus_(
    orderId,
    'Completed',
    true
  );

  feedbackInteractionOfferFinalComment_(
    recipient,
    orderId
  );
}


function feedbackInteractionOfferFinalComment_(recipient, orderId) {
  feedbackInteractionSetPendingCommentState_(
    recipient,
    {
      mode: 'FINAL',
      orderId: orderId,
      itemCode: 'DELIVERY',
      dishName: 'Overall feedback'
    }
  );

  sendTextMessage_(
    recipient,
    'Thank you for your feedback. It helps Ma Kitchens and our local cooks improve. If you would like to add anything else about the food or delivery, just reply with a comment. Otherwise, no reply is needed.'
  );
}



/* =========================================================
   OPTIONAL FREE-TEXT FEEDBACK COMMENTS
   ========================================================= */

const FEEDBACK_COMMENT_STATE_PREFIX =
  'FEEDBACK_COMMENT_STATE_';

const FEEDBACK_COMMENT_STATE_TTL_MS =
  6 * 60 * 60 * 1000;


function handleFeedbackTextReply_(recipient, text, message) {
  const state =
    feedbackInteractionGetPendingCommentState_(
      recipient
    );

  if (!state) {
    return false;
  }

  const cleanText =
    String(text || '').trim();

  if (!cleanText) {
    return true;
  }

  /*
    Never hijack a deliberate new-order command.
    Clear the optional feedback-comment state and let
    Code.gs continue into the normal order flow.
  */
  if (
    cleanText.toUpperCase() ===
    'START ORDER'
  ) {
    feedbackInteractionClearPendingCommentState_(
      recipient
    );

    return false;
  }

  const isSkip =
    cleanText.toUpperCase() === 'SKIP';

  if (state.mode === 'DISH_OTHER') {
    if (!isSkip) {
      feedbackInteractionAppendComment_(
        state.orderId,
        state.itemCode,
        cleanText,
        message,
        'Other'
      );
    }

    feedbackInteractionClearPendingCommentState_(
      recipient
    );

    feedbackInteractionSendNextDish_(
      recipient,
      state.orderId
    );

    return true;
  }

  if (state.mode === 'DELIVERY_LOW') {
    if (!isSkip) {
      feedbackInteractionAppendComment_(
        state.orderId,
        'DELIVERY',
        cleanText,
        message,
        'Delivery'
      );
    }

    feedbackInteractionClearPendingCommentState_(
      recipient
    );

    feedbackInteractionOfferFinalComment_(
      recipient,
      state.orderId
    );

    return true;
  }

  if (state.mode === 'FINAL') {
    if (!isSkip) {
      feedbackInteractionAppendComment_(
        state.orderId,
        'DELIVERY',
        cleanText,
        message,
        'Additional comment'
      );

      sendTextMessage_(
        recipient,
        'Thank you. Your additional comment has been saved.'
      );
    }

    feedbackInteractionClearPendingCommentState_(
      recipient
    );

    return true;
  }

  feedbackInteractionClearPendingCommentState_(
    recipient
  );

  return false;
}


function feedbackInteractionSetPendingCommentState_(
  recipient,
  state
) {
  const phone =
    String(recipient || '')
      .replace(/\D/g, '');

  if (!phone) {
    throw new Error(
      'Cannot create feedback comment state without recipient.'
    );
  }

  const payload = {
    mode:
      String(state && state.mode || '').trim(),
    orderId:
      String(state && state.orderId || '').trim(),
    itemCode:
      String(state && state.itemCode || '').trim(),
    dishName:
      String(state && state.dishName || '').trim(),
    expiresAt:
      Date.now() +
      FEEDBACK_COMMENT_STATE_TTL_MS
  };

  PropertiesService
    .getScriptProperties()
    .setProperty(
      FEEDBACK_COMMENT_STATE_PREFIX +
        phone,
      JSON.stringify(payload)
    );
}


function feedbackInteractionGetPendingCommentState_(
  recipient
) {
  const phone =
    String(recipient || '')
      .replace(/\D/g, '');

  if (!phone) {
    return null;
  }

  const props =
    PropertiesService.getScriptProperties();

  const key =
    FEEDBACK_COMMENT_STATE_PREFIX +
    phone;

  const raw =
    props.getProperty(key);

  if (!raw) {
    return null;
  }

  let state;

  try {
    state = JSON.parse(raw);
  } catch (err) {
    props.deleteProperty(key);
    return null;
  }

  const expiresAt =
    Number(state.expiresAt || 0);

  if (
    !expiresAt ||
    Date.now() > expiresAt
  ) {
    props.deleteProperty(key);
    return null;
  }

  return state;
}


function feedbackInteractionClearPendingCommentState_(
  recipient
) {
  const phone =
    String(recipient || '')
      .replace(/\D/g, '');

  if (!phone) {
    return;
  }

  PropertiesService
    .getScriptProperties()
    .deleteProperty(
      FEEDBACK_COMMENT_STATE_PREFIX +
        phone
    );
}


function feedbackInteractionAppendComment_(orderId, itemCode, commentText, message, label) { return fwLegacyComment_(orderId, itemCode, commentText, message, label); }


/* =========================================================
   CONTROL TOWER LOOKUPS
   ========================================================= */

function feedbackInteractionVerifyOrderAccess_(recipient, orderId) {
  try {
    const book = fwBook_(), order = fwOrder_(book, fwOrderId_(orderId));
    const customers = fwTable_(book, 'Customers', ['Customer ID', 'Phone']);
    const rows = customers.rows.filter(r => String(r[customers.col['Customer ID']]).trim() === order.customerId);
    if (rows.length !== 1 || feedbackInteractionNormalisePhone_(rows[0][customers.col.Phone]) !== feedbackInteractionNormalisePhone_(recipient)) return { allowed: false, reason: 'SENDER_DOES_NOT_MATCH_CUSTOMER' };
    const schema = fwSchema_(book), state = fwState_(schema, orderId, true);
    const complete = fwCompleted_(schema, orderId, state, order.delivery);
    // Preserve post-completion optional legacy comment handling, but freeze ratings.
    return { allowed: !complete, reason: complete ? 'COMPLETED' : 'OK', customerId: order.customerId, feedbackStatus: complete ? 'Completed' : String(order.delivery.row[order.delivery.table.col['Feedback Status']] || '') };
  } catch (_) { return { allowed: false, reason: 'INELIGIBLE_OR_CONFIGURATION' }; }
}


function feedbackInteractionGetOrderItems_(orderId) { return fwOrder_(fwBook_(), fwOrderId_(orderId)).dishes.map(d => ({ itemCode: d.itemCode, dishName: d.dishName, cookId: d.cookId })); }


/* =========================================================
   FEEDBACK SHEET WRITES
   ========================================================= */

function feedbackInteractionSaveFeedback_(orderId, customerId, item, rating, complaint, followUpStatus, message) { return fwLegacySave_(orderId, customerId, item, rating, complaint, followUpStatus, message); }

function feedbackInteractionGetCompletedItemCodes_(orderId) { return fwLegacyCodes_(orderId, false); }


function feedbackInteractionHasFeedbackItem_(orderId, itemCode) { return !!fwLegacyCodes_(orderId, true)[itemCode]; }


function feedbackInteractionSetDeliveryFeedbackStatus_(orderId, status, completed) { return fwLegacyStatus_(orderId, status, completed); }


/* =========================================================
   GENERIC HELPERS
   ========================================================= */

function feedbackInteractionReadSheet_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values.length
    ? values[0].map(value => String(value || '').trim())
    : [];

  const map = {};

  headers.forEach((header, index) => {
    map[header] = index;
  });

  return {
    headers: headers,
    map: map,
    rows: values.slice(1)
  };
}


function feedbackInteractionRequireHeader_(map, header) {
  if (map[header] === undefined) {
    throw new Error(
      'Missing required column: ' + header
    );
  }

  return map[header];
}


function feedbackInteractionOptionalHeader_(map, names) {
  for (let i = 0; i < names.length; i++) {
    if (map[names[i]] !== undefined) {
      return map[names[i]];
    }
  }

  return -1;
}


function feedbackInteractionNormalisePhone_(value) {
  let digits = String(value || '')
    .replace(/\D/g, '');

  if (
    digits.startsWith('0') &&
    digits.length === 10
  ) {
    digits = '61' + digits.substring(1);
  }

  return digits;
}


function feedbackInteractionNextFeedbackId_(sheet) {
  let max = 0; sheet.getDataRange().getValues().slice(1).forEach(r => { const m = String(r[0]).match(/^(?:FB|FDBK)-(\d+)$/i); if (m) max = Math.max(max, Number(m[1])); });
  return 'FB-' + String(max + 1).padStart(6, '0');
}


/* =========================================================
   SAFE MANUAL TEST
   ========================================================= */

function testFeedbackInteractionConfiguration() {
  const spreadsheet = SpreadsheetApp.openById(
    CONTROL_TOWER_SPREADSHEET_ID
  );

  const requiredSheets = [
    FEEDBACK_INTERACTION_FEEDBACK_SHEET,
    FEEDBACK_INTERACTION_DELIVERIES_SHEET,
    FEEDBACK_INTERACTION_ORDER_ITEMS_SHEET,
    FEEDBACK_INTERACTION_ORDERS_SHEET,
    FEEDBACK_INTERACTION_CUSTOMERS_SHEET,
    FEEDBACK_INTERACTION_DISHES_SHEET
  ];

  const missingSheets = requiredSheets.filter(name => {
    return !spreadsheet.getSheetByName(name);
  });

  const feedbackSheet = spreadsheet.getSheetByName(
    FEEDBACK_INTERACTION_FEEDBACK_SHEET
  );

  const feedbackHeaders = feedbackSheet
    ? feedbackInteractionReadSheet_(feedbackSheet).headers
    : [];

  const requiredFeedbackHeaders = [
    'Feedback ID',
    'Submitted At',
    'Order ID',
    'Customer ID',
    'Cook ID',
    'Item Code',
    'Rating / 5',
    'Complaint',
    'Refund',
    'Comments',
    'Follow-up Status',
    'WhatsApp Message ID'
  ];

  const missingFeedbackHeaders =
    requiredFeedbackHeaders.filter(header => {
      return !feedbackHeaders.includes(header);
    });

  const result = {
    ok:
      missingSheets.length === 0 &&
      missingFeedbackHeaders.length === 0,
    missingSheets: missingSheets,
    missingFeedbackHeaders: missingFeedbackHeaders,
    sendsMessages: false,
    writesData: false
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}


/* =========================================================
   SAFE ORDER LOOKUP DRY RUN
   No messages are sent and no spreadsheet data is changed.
   ========================================================= */

function testFeedbackInteractionDryRun_ORD000002() {
  const orderId = 'ORD-000002';

  const spreadsheet = SpreadsheetApp.openById(
    CONTROL_TOWER_SPREADSHEET_ID
  );

  const ordersSheet = spreadsheet.getSheetByName(
    FEEDBACK_INTERACTION_ORDERS_SHEET
  );

  const customersSheet = spreadsheet.getSheetByName(
    FEEDBACK_INTERACTION_CUSTOMERS_SHEET
  );

  const deliveriesSheet = spreadsheet.getSheetByName(
    FEEDBACK_INTERACTION_DELIVERIES_SHEET
  );

  if (!ordersSheet || !customersSheet || !deliveriesSheet) {
    throw new Error(
      'Orders, Customers or Deliveries sheet not found.'
    );
  }

  const orderData = feedbackInteractionReadSheet_(ordersSheet);
  const customerData = feedbackInteractionReadSheet_(customersSheet);
  const deliveryData = feedbackInteractionReadSheet_(deliveriesSheet);

  const orderIdIndex = feedbackInteractionRequireHeader_(
    orderData.map,
    'Order ID'
  );

  const orderCustomerIdIndex = feedbackInteractionRequireHeader_(
    orderData.map,
    'Customer ID'
  );

  const orderRow = orderData.rows.find(row => {
    return String(row[orderIdIndex] || '').trim() === orderId;
  });

  if (!orderRow) {
    throw new Error(orderId + ' was not found in Orders.');
  }

  const customerId = String(
    orderRow[orderCustomerIdIndex] || ''
  ).trim();

  const customerIdIndex = feedbackInteractionRequireHeader_(
    customerData.map,
    'Customer ID'
  );

  const customerNameIndex = feedbackInteractionRequireHeader_(
    customerData.map,
    'Name'
  );

  const customerPhoneIndex = feedbackInteractionRequireHeader_(
    customerData.map,
    'Phone'
  );

  const customerOptInIndex = feedbackInteractionRequireHeader_(
    customerData.map,
    'WhatsApp Opt-In'
  );

  const customerRow = customerData.rows.find(row => {
    return String(row[customerIdIndex] || '').trim() === customerId;
  });

  if (!customerRow) {
    throw new Error(
      customerId + ' was not found in Customers.'
    );
  }

  const customerName = String(
    customerRow[customerNameIndex] || ''
  ).trim();

  const customerPhone = feedbackInteractionNormalisePhone_(
    customerRow[customerPhoneIndex]
  );

  const whatsappOptIn = String(
    customerRow[customerOptInIndex] || ''
  ).trim();

  const deliveryOrderIdIndex = feedbackInteractionRequireHeader_(
    deliveryData.map,
    'Order ID'
  );

  const deliveryStatusIndex = feedbackInteractionRequireHeader_(
    deliveryData.map,
    'Delivery Status'
  );

  const feedbackStatusIndex = feedbackInteractionRequireHeader_(
    deliveryData.map,
    'Feedback Status'
  );

  const routificIdIndex = feedbackInteractionRequireHeader_(
    deliveryData.map,
    'Routific ID'
  );

  const deliveryRow = deliveryData.rows.find(row => {
    return String(row[deliveryOrderIdIndex] || '').trim() === orderId;
  });

  const deliveryStatus = deliveryRow
    ? String(deliveryRow[deliveryStatusIndex] || '').trim()
    : '';

  const feedbackStatus = deliveryRow
    ? String(deliveryRow[feedbackStatusIndex] || '').trim()
    : '';

  const routificId = deliveryRow
    ? String(deliveryRow[routificIdIndex] || '').trim()
    : '';

  const items = feedbackInteractionGetOrderItems_(orderId);

  const accessCheck = customerPhone
    ? feedbackInteractionVerifyOrderAccess_(
        customerPhone,
        orderId
      )
    : {
        allowed: false,
        reason: 'CUSTOMER_PHONE_MISSING'
      };

  const result = {
    dryRun: true,
    sendsMessages: false,
    writesData: false,
    orderId: orderId,
    customerId: customerId,
    customerName: customerName,
    customerPhone:
      customerPhone ? '+' + customerPhone : '',
    whatsappOptIn: whatsappOptIn,
    deliveryFound: !!deliveryRow,
    deliveryStatus: deliveryStatus,
    feedbackStatus:
      feedbackStatus || '(blank)',
    routificId: routificId,
    items: items,
    itemCount: items.length,
    accessCheckUsingCustomerPhone: accessCheck
  };

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}


/* =========================================================
   SAFE OWNER ORDER LOOKUP DRY RUN
   Finds Control Tower orders whose actual customer phone
   matches the authorised owner WhatsApp number.
   No messages are sent and no spreadsheet data is changed.
   ========================================================= */

function testFeedbackInteractionFindOwnerOrders() {
  const ownerPhone = feedbackInteractionNormalisePhone_(
    OWNER_WHATSAPP_PHONE
  );

  const spreadsheet = SpreadsheetApp.openById(
    CONTROL_TOWER_SPREADSHEET_ID
  );

  const ordersSheet = spreadsheet.getSheetByName(
    FEEDBACK_INTERACTION_ORDERS_SHEET
  );

  const customersSheet = spreadsheet.getSheetByName(
    FEEDBACK_INTERACTION_CUSTOMERS_SHEET
  );

  const deliveriesSheet = spreadsheet.getSheetByName(
    FEEDBACK_INTERACTION_DELIVERIES_SHEET
  );

  if (!ordersSheet || !customersSheet || !deliveriesSheet) {
    throw new Error(
      'Orders, Customers or Deliveries sheet not found.'
    );
  }

  const orderData = feedbackInteractionReadSheet_(ordersSheet);
  const customerData = feedbackInteractionReadSheet_(customersSheet);
  const deliveryData = feedbackInteractionReadSheet_(deliveriesSheet);

  const customerIdIndex = feedbackInteractionRequireHeader_(
    customerData.map,
    'Customer ID'
  );

  const customerNameIndex = feedbackInteractionRequireHeader_(
    customerData.map,
    'Name'
  );

  const customerPhoneIndex = feedbackInteractionRequireHeader_(
    customerData.map,
    'Phone'
  );

  const customerOptInIndex = feedbackInteractionRequireHeader_(
    customerData.map,
    'WhatsApp Opt-In'
  );

  const matchingCustomers = customerData.rows
    .map(row => {
      const phone = feedbackInteractionNormalisePhone_(
        row[customerPhoneIndex]
      );

      return {
        customerId: String(
          row[customerIdIndex] || ''
        ).trim(),
        customerName: String(
          row[customerNameIndex] || ''
        ).trim(),
        customerPhone: phone,
        whatsappOptIn: String(
          row[customerOptInIndex] || ''
        ).trim()
      };
    })
    .filter(customer => {
      return (
        customer.customerId &&
        customer.customerPhone === ownerPhone
      );
    });

  const matchingCustomerIds = {};
  matchingCustomers.forEach(customer => {
    matchingCustomerIds[customer.customerId] = customer;
  });

  const orderIdIndex = feedbackInteractionRequireHeader_(
    orderData.map,
    'Order ID'
  );

  const orderCustomerIdIndex = feedbackInteractionRequireHeader_(
    orderData.map,
    'Customer ID'
  );

  const deliveryOrderIdIndex = feedbackInteractionRequireHeader_(
    deliveryData.map,
    'Order ID'
  );

  const deliveryStatusIndex = feedbackInteractionRequireHeader_(
    deliveryData.map,
    'Delivery Status'
  );

  const feedbackStatusIndex = feedbackInteractionRequireHeader_(
    deliveryData.map,
    'Feedback Status'
  );

  const routificIdIndex = feedbackInteractionRequireHeader_(
    deliveryData.map,
    'Routific ID'
  );

  const deliveryByOrderId = {};

  deliveryData.rows.forEach(row => {
    const orderId = String(
      row[deliveryOrderIdIndex] || ''
    ).trim();

    if (!orderId) {
      return;
    }

    deliveryByOrderId[orderId] = {
      deliveryStatus: String(
        row[deliveryStatusIndex] || ''
      ).trim(),
      feedbackStatus: String(
        row[feedbackStatusIndex] || ''
      ).trim(),
      routificId: String(
        row[routificIdIndex] || ''
      ).trim()
    };
  });

  const orders = [];

  orderData.rows.forEach(row => {
    const orderId = String(
      row[orderIdIndex] || ''
    ).trim();

    const customerId = String(
      row[orderCustomerIdIndex] || ''
    ).trim();

    if (
      !orderId ||
      !matchingCustomerIds[customerId]
    ) {
      return;
    }

    const customer = matchingCustomerIds[customerId];
    const delivery = deliveryByOrderId[orderId] || {};

    orders.push({
      orderId: orderId,
      customerId: customerId,
      customerName: customer.customerName,
      customerPhone:
        customer.customerPhone
          ? '+' + customer.customerPhone
          : '',
      whatsappOptIn:
        customer.whatsappOptIn,
      deliveryStatus:
        delivery.deliveryStatus || '',
      feedbackStatus:
        delivery.feedbackStatus || '(blank)',
      routificId:
        delivery.routificId || '',
      itemCount:
        feedbackInteractionGetOrderItems_(
          orderId
        ).length
    });
  });

  const result = {
    dryRun: true,
    sendsMessages: false,
    writesData: false,
    authorisedOwnerPhone:
      ownerPhone ? '+' + ownerPhone : '',
    matchingCustomerCount:
      matchingCustomers.length,
    matchingCustomers:
      matchingCustomers.map(customer => {
        return {
          customerId:
            customer.customerId,
          customerName:
            customer.customerName,
          customerPhone:
            customer.customerPhone
              ? '+' + customer.customerPhone
              : '',
          whatsappOptIn:
            customer.whatsappOptIn
        };
      }),
    matchingOrderCount:
      orders.length,
    orders: orders
  };

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}
