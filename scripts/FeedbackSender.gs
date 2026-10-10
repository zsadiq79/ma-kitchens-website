const FEEDBACK_SENDER_SPREADSHEET_ID = CONTROL_TOWER_SPREADSHEET_ID;

const FEEDBACK_TEMPLATE_NAME =
  'customer_feedback_request';

const FEEDBACK_TEMPLATE_LANGUAGE =
  'en';

const FEEDBACK_TRIGGER_FUNCTION =
  'runFeedbackSender';


/* =========================================================
   SEND APPROVED WHATSAPP FEEDBACK TEMPLATE
   ========================================================= */

function sendCustomerFeedbackTemplate_(
  recipient,
  customerFirstName,
  orderId
) {
  const liveEnabled =
    PropertiesService.getScriptProperties()
      .getProperty('FEEDBACK_LIVE_ENABLED') === 'true';

  if (!liveEnabled) {
    throw new Error(
      'Feedback sending is disabled. ' +
      'FEEDBACK_LIVE_ENABLED is not true.'
    );
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: FEEDBACK_TEMPLATE_NAME,
      language: {
        code: FEEDBACK_TEMPLATE_LANGUAGE
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: customerFirstName
            }
          ]
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [
            {
              type: 'payload',
              payload: 'FEEDBACK|' + orderId
            }
          ]
        }
      ]
    }
  };

  const responseText =
    sendWhatsAppPayload_(payload);

  let responseJson = {};

  try {
    responseJson =
      JSON.parse(responseText);
  } catch (err) {
    throw new Error(
      'WhatsApp feedback template was accepted, ' +
      'but the response could not be parsed.'
    );
  }

  const messageId =
    responseJson &&
    responseJson.messages &&
    responseJson.messages[0] &&
    responseJson.messages[0].id
      ? String(responseJson.messages[0].id)
      : '';

  if (!messageId) {
    throw new Error(
      'WhatsApp feedback template response ' +
      'did not contain a message ID.'
    );
  }

  return {
    messageId: messageId,
    rawResponse: responseJson
  };
}



/* =========================================================
   OWNER-ONLY FEEDBACK EXPERIENCE PREVIEW
   Uses the real approved customer_feedback_request template.
   Does NOT enable production feedback and does NOT write sheets.
   ========================================================= */

function previewOwnerFeedbackJourney() {
  const ownerRecipient = '61420306705';

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: ownerRecipient,
    type: 'template',
    template: {
      name: FEEDBACK_TEMPLATE_NAME,
      language: {
        code: FEEDBACK_TEMPLATE_LANGUAGE
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: 'Zeeshan'
            }
          ]
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: '0',
          parameters: [
            {
              type: 'payload',
              payload: 'FEEDBACK_PREVIEW|START'
            }
          ]
        }
      ]
    }
  };

  const responseText = sendWhatsAppPayload_(payload);

  let responseJson = {};

  try {
    responseJson = JSON.parse(responseText);
  } catch (err) {
    throw new Error(
      'Owner feedback preview template was accepted, ' +
      'but the response could not be parsed.'
    );
  }

  const messageId =
    responseJson &&
    responseJson.messages &&
    responseJson.messages[0] &&
    responseJson.messages[0].id
      ? String(responseJson.messages[0].id)
      : '';

  if (!messageId) {
    throw new Error(
      'Owner feedback preview response did not contain a message ID.'
    );
  }

  console.log(
    'Owner-only feedback preview sent to +' +
    ownerRecipient +
    ' | message ' +
    messageId
  );

  return {
    preview: true,
    recipient: '+' + ownerRecipient,
    template: FEEDBACK_TEMPLATE_NAME,
    feedbackLiveEnabled: feedbackIsLiveEnabled_(),
    spreadsheetWrites: false,
    messageId: messageId
  };
}

/* =========================================================
   FIND DELIVERIES WHOSE FEEDBACK IS DUE
   ========================================================= */

function findFeedbackCandidates_() {
  const book = fwBook_();
  const t = fwTable_(book, 'Deliveries', ['Order ID', 'Delivery Status', 'Delivered At', 'Feedback Status', 'Routific ID']);
  return t.rows.map((row, i) => feedbackSenderDecision_(t, row, i + 2, Date.now())).filter(d => d.eligible).map(d => d.candidate);
}


/* =========================================================
   RESOLVE CUSTOMER FROM CONTROL TOWER
   ========================================================= */

function resolveFeedbackCandidate_(candidate) {
  const spreadsheet =
    fwBook_();

  const ordersSheet =
    spreadsheet.getSheetByName('Orders');

  const customersSheet =
    spreadsheet.getSheetByName('Customers');

  if (!ordersSheet) {
    throw new Error(
      'Orders sheet not found.'
    );
  }

  if (!customersSheet) {
    throw new Error(
      'Customers sheet not found.'
    );
  }

  const orderValues =
    ordersSheet
      .getDataRange()
      .getValues();

  const orderColumn =
    feedbackHeaderMap_(
      orderValues[0]
    );

  [
    'Order ID',
    'Customer ID'
  ].forEach(header => {
    feedbackRequireColumn_(
      orderColumn,
      header,
      'Orders'
    );
  });

  let orderRow = null;

  for (
    let rowIndex = 1;
    rowIndex < orderValues.length;
    rowIndex++
  ) {
    if (
      String(
        orderValues[rowIndex][
          orderColumn['Order ID']
        ] || ''
      ).trim() === candidate.orderId
    ) {
      orderRow =
        orderValues[rowIndex];

      break;
    }
  }

  if (!orderRow) {
    return {
      allowed: false,
      statusIfProcessed: 'Error',
      reason: 'ORDER_NOT_FOUND',
      orderId: candidate.orderId
    };
  }

  const customerId =
    String(
      orderRow[
        orderColumn['Customer ID']
      ] || ''
    ).trim();

  if (!customerId) {
    return {
      allowed: false,
      statusIfProcessed: 'Error',
      reason: 'CUSTOMER_ID_MISSING',
      orderId: candidate.orderId
    };
  }

  const customerValues =
    customersSheet
      .getDataRange()
      .getValues();

  const customerColumn =
    feedbackHeaderMap_(
      customerValues[0]
    );

  [
    'Customer ID',
    'Name',
    'Phone',
    'WhatsApp Opt-In'
  ].forEach(header => {
    feedbackRequireColumn_(
      customerColumn,
      header,
      'Customers'
    );
  });

  let customerRow = null;

  for (
    let rowIndex = 1;
    rowIndex < customerValues.length;
    rowIndex++
  ) {
    if (
      String(
        customerValues[rowIndex][
          customerColumn['Customer ID']
        ] || ''
      ).trim() === customerId
    ) {
      customerRow =
        customerValues[rowIndex];

      break;
    }
  }

  if (!customerRow) {
    return {
      allowed: false,
      statusIfProcessed: 'Error',
      reason: 'CUSTOMER_NOT_FOUND',
      orderId: candidate.orderId,
      customerId: customerId
    };
  }

  const customerName =
    String(
      customerRow[
        customerColumn['Name']
      ] || ''
    ).trim();

  const rawPhone =
    String(
      customerRow[
        customerColumn['Phone']
      ] || ''
    ).trim();

  const whatsappOptIn =
    String(
      customerRow[
        customerColumn['WhatsApp Opt-In']
      ] || ''
    ).trim()
      .toUpperCase();

  const recipient =
    feedbackNormalisePhoneDigits_(
      rawPhone
    );

  const customerPhone =
    recipient
      ? '+' + recipient
      : '';

  const firstName =
    feedbackFirstName_(
      customerName
    );

  if (whatsappOptIn !== 'Y') {
    return {
      allowed: false,
      statusIfProcessed: 'Skipped',
      reason: 'WHATSAPP_NOT_OPTED_IN',
      orderId: candidate.orderId,
      customerId: customerId,
      customerName: customerName,
      customerPhone: customerPhone,
      whatsappOptIn: whatsappOptIn
    };
  }

  if (!/^614\d{8}$/.test(recipient)) {
    return {
      allowed: false,
      statusIfProcessed: 'Error',
      reason: 'INVALID_OR_MISSING_PHONE',
      orderId: candidate.orderId,
      customerId: customerId,
      customerName: customerName,
      customerPhone: customerPhone,
      whatsappOptIn: whatsappOptIn
    };
  }

  if (!firstName) {
    return {
      allowed: false,
      statusIfProcessed: 'Error',
      reason: 'CUSTOMER_NAME_MISSING',
      orderId: candidate.orderId,
      customerId: customerId,
      customerPhone: customerPhone,
      whatsappOptIn: whatsappOptIn
    };
  }

  return {
    allowed: true,
    reason: 'ELIGIBLE',
    orderId: candidate.orderId,
    deliveryRowNumber:
      candidate.deliveryRowNumber,
    routificId:
      candidate.routificId,
    deliveredAt:
      candidate.deliveredAt,
    feedbackDueAt:
      candidate.feedbackDueAt,
    customerId: customerId,
    customerName: customerName,
    customerFirstName: firstName,
    customerPhone: customerPhone,
    recipient: recipient,
    whatsappOptIn: whatsappOptIn
  };
}


/* =========================================================
   READ-ONLY QUEUE SNAPSHOT
   ========================================================= */

function buildFeedbackQueueSnapshot_() {
  const candidates =
    findFeedbackCandidates_();

  return candidates.map(
    candidate =>
      resolveFeedbackCandidate_(
        candidate
      )
  );
}


/* =========================================================
   PRODUCTION FEEDBACK SENDER
   ========================================================= */

function runFeedbackSender() {
  // No cutover by installation: existing template remains the default.
  if (fwProps_().getProperty("FEEDBACK_V2_SENDER_ENABLED") === "true") return runFeedbackWebSender_();
  const liveEnabled =
    feedbackIsLiveEnabled_();

  if (!liveEnabled) {
    console.log(
      'Feedback sender is OFF. ' +
      'No customer messages were sent.'
    );

    return {
      liveEnabled: false,
      candidates: 0,
      sent: 0,
      skipped: 0,
      errors: 0
    };
  }

  fwBook_(); // Verify the shared spreadsheet binding before any outbound action.

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    const spreadsheet =
      fwBook_();

    const deliveriesSheet =
      spreadsheet.getSheetByName(
        'Deliveries'
      );

    if (!deliveriesSheet) {
      throw new Error(
        'Deliveries sheet not found.'
      );
    }

    const headerValues =
      deliveriesSheet
        .getRange(
          1,
          1,
          1,
          deliveriesSheet.getLastColumn()
        )
        .getValues()[0];

    const deliveryColumn =
      feedbackHeaderMap_(
        headerValues
      );

    [
      'Order ID',
      'Feedback Status',
      'Feedback Requested At'
    ].forEach(header => {
      feedbackRequireColumn_(
        deliveryColumn,
        header,
        'Deliveries'
      );
    });

    const candidates =
      findFeedbackCandidates_();

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    candidates.forEach(
      candidate => {
        const resolution =
          resolveFeedbackCandidate_(
            candidate
          );

        /*
          Re-read the status immediately
          before taking action.
        */
        const currentStatus =
          String(
            deliveriesSheet
              .getRange(
                candidate.deliveryRowNumber,
                deliveryColumn[
                  'Feedback Status'
                ] + 1
              )
              .getDisplayValue() || ''
          ).trim();

        if (
          currentStatus &&
          currentStatus !== 'Not Sent'
        ) {
          console.log(
            'Feedback blocked for ' +
            candidate.orderId +
            '. Current status: ' +
            currentStatus
          );

          skipped++;

          return;
        }

        if (!resolution.allowed) {
          const statusToWrite =
            resolution.statusIfProcessed ||
            'Error';

          deliveriesSheet
            .getRange(
              candidate.deliveryRowNumber,
              deliveryColumn[
                'Feedback Status'
              ] + 1
            )
            .setValue(
              statusToWrite
            );

          console.log(
            'Feedback not sent for ' +
            candidate.orderId +
            '. Reason: ' +
            resolution.reason
          );

          if (
            statusToWrite === 'Skipped'
          ) {
            skipped++;
          } else {
            errors++;
          }

          return;
        }

        try {
          const sendResult =
            sendCustomerFeedbackTemplate_(
              resolution.recipient,
              resolution.customerFirstName,
              resolution.orderId
            );

          const now =
            new Date();

          /*
            Permanently register the outbound feedback request
            before marking the Deliveries lifecycle row Sent.
            This records the exact Meta message ID used later
            by asynchronous sent/delivered/read/failed callbacks.
          */
          registerWhatsAppOutbound_(
            sendResult.messageId,
            resolution.orderId,
            'feedback_request',
            resolution.recipient,
            now
          );

          deliveriesSheet
            .getRange(
              candidate.deliveryRowNumber,
              deliveryColumn[
                'Feedback Status'
              ] + 1
            )
            .setValue('Sent');

          deliveriesSheet
            .getRange(
              candidate.deliveryRowNumber,
              deliveryColumn[
                'Feedback Requested At'
              ] + 1
            )
            .setValue(now);

          console.log(
            'Feedback template sent for ' +
            candidate.orderId +
            ' | customer ' +
            resolution.customerId +
            ' | message ' +
            sendResult.messageId
          );

          sent++;

        } catch (err) {
          deliveriesSheet
            .getRange(
              candidate.deliveryRowNumber,
              deliveryColumn[
                'Feedback Status'
              ] + 1
            )
            .setValue('Error');

          console.error(
            'Feedback send failed for ' +
            candidate.orderId +
            ': ' +
            (err.stack || err)
          );

          errors++;
        }
      }
    );

    SpreadsheetApp.flush();

    const report = {
      liveEnabled: true,
      candidates:
        candidates.length,
      sent: sent,
      skipped: skipped,
      errors: errors
    };

    console.log(
      JSON.stringify(
        report,
        null,
        2
      )
    );

    return report;

  } finally {
    lock.releaseLock();
  }
}


/* =========================================================
   AUTOMATION CONTROLS
   ========================================================= */

function installFeedbackAutomation() {
  removeFeedbackAutomation_();

  ScriptApp
    .newTrigger(
      FEEDBACK_TRIGGER_FUNCTION
    )
    .timeBased()
    .everyMinutes(5)
    .create();

  const result = {
    installed: true,
    function:
      FEEDBACK_TRIGGER_FUNCTION,
    intervalMinutes: 5,
    liveEnabled:
      feedbackIsLiveEnabled_()
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


function removeFeedbackAutomation() {
  const removed =
    removeFeedbackAutomation_();

  const result = {
    removedTriggers:
      removed,
    liveEnabled:
      feedbackIsLiveEnabled_()
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


function removeFeedbackAutomation_() {
  const triggers =
    ScriptApp.getProjectTriggers();

  let removed = 0;

  triggers.forEach(trigger => {
    if (
      trigger.getHandlerFunction() ===
      FEEDBACK_TRIGGER_FUNCTION
    ) {
      ScriptApp.deleteTrigger(
        trigger
      );

      removed++;
    }
  });

  return removed;
}


function enableFeedbackLive() {
  PropertiesService
    .getScriptProperties()
    .setProperty(
      'FEEDBACK_LIVE_ENABLED',
      'true'
    );

  const result = {
    feedbackLiveEnabled: true,
    message:
      'Feedback sending is now LIVE.'
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


function disableFeedbackLive() {
  PropertiesService
    .getScriptProperties()
    .setProperty(
      'FEEDBACK_LIVE_ENABLED',
      'false'
    );

  const result = {
    feedbackLiveEnabled: false,
    message:
      'Feedback sending is OFF.'
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
   STATUS AND MANUAL TESTS
   ========================================================= */

function checkFeedbackAutomationStatus() {
  const triggers =
    ScriptApp.getProjectTriggers();

  const feedbackTriggers =
    triggers.filter(
      trigger =>
        trigger.getHandlerFunction() ===
        FEEDBACK_TRIGGER_FUNCTION
    );

  const result = {
    feedbackLiveEnabled:
      feedbackIsLiveEnabled_(),
    feedbackTriggerCount:
      feedbackTriggers.length,
    triggerFunction:
      FEEDBACK_TRIGGER_FUNCTION,
    queueCandidates:
      findFeedbackCandidates_().length
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


function testFindFeedbackCandidates() {
  const candidates =
    findFeedbackCandidates_();

  console.log(
    JSON.stringify(
      candidates,
      null,
      2
    )
  );

  return candidates;
}


function testFeedbackQueueResolution() {
  const results =
    buildFeedbackQueueSnapshot_();

  console.log(
    JSON.stringify(
      results,
      null,
      2
    )
  );

  return results;
}


function testFeedbackSenderSafetySwitch() {
  const liveEnabled =
    feedbackIsLiveEnabled_();

  const result = {
    feedbackLiveEnabled:
      liveEnabled,
    safeToTest:
      !liveEnabled
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
   HELPERS
   ========================================================= */

function feedbackIsLiveEnabled_() {
  return (
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'FEEDBACK_LIVE_ENABLED'
      ) === 'true'
  );
}


function feedbackHeaderMap_(headerRow) {
  const map = {};

  headerRow.forEach(
    (value, index) => {
      map[
        String(value || '').trim()
      ] = index;
    }
  );

  return map;
}


function feedbackRequireColumn_(
  map,
  header,
  sheetName
) {
  if (
    map[header] === undefined
  ) {
    throw new Error(
      'Missing ' +
      sheetName +
      ' column: ' +
      header
    );
  }
}


function feedbackNormalisePhoneDigits_(
  value
) {
  let digits =
    String(value || '')
      .replace(/\D/g, '');

  if (
    digits.startsWith('0') &&
    digits.length === 10
  ) {
    digits =
      '61' +
      digits.substring(1);
  }

  return digits;
}


function feedbackFirstName_(name) {
  const clean =
    String(name || '')
      .trim();

  if (!clean) {
    return '';
  }

  return clean
    .split(/\s+/)[0];
}


function feedbackNextDay10am_(deliveredAt, timeZone) {
  const time = fwTime_(deliveredAt); return Number.isFinite(time) ? new Date(time + FW.delay) : null;
}
