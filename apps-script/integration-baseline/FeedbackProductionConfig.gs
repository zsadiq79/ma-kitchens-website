function saveFeedbackProductionConfig() {
  const productionId =
    '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4';

  if (CONTROL_TOWER_SPREADSHEET_ID !== productionId) {
    throw new Error('Production spreadsheet ID mismatch.');
  }

  const settings = {
    CONTROL_TOWER_SPREADSHEET_ID: productionId,
    FEEDBACK_LIVE_ENABLED: 'false',
    FEEDBACK_V2_SENDER_ENABLED: 'false',
    FEEDBACK_V2_WRITES_ENABLED: 'false',
    FEEDBACK_WEB_BASE_URL:
      'https://www.makitchens.com.au/feedback/',
    FEEDBACK_WEB_TEMPLATE_NAME: 'customer_feedback_web_v1',
    FEEDBACK_WEB_TEMPLATE_URL:
      'https://www.makitchens.com.au/feedback/{{1}}',
    FEEDBACK_WEB_TEMPLATE_URL_CONFIRMED: 'false'
  };

  const props = PropertiesService.getScriptProperties();
  props.setProperties(settings, false);

  for (const [name, value] of Object.entries(settings)) {
    if (props.getProperty(name) !== value) {
      throw new Error('Setting did not persist: ' + name);
    }
  }

  console.log('All eight production settings saved and verified.');
}

function saveProductionFeedbackSigningKey() {
  const productionId =
    '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4';

  if (CONTROL_TOWER_SPREADSHEET_ID !== productionId) {
    throw new Error('Production spreadsheet ID mismatch.');
  }

  const props = PropertiesService.getScriptProperties();

  if (props.getProperty('FEEDBACK_LIVE_ENABLED') !== 'false' ||
      props.getProperty('FEEDBACK_V2_WRITES_ENABLED') !== 'false') {
    throw new Error('Keep sending and feedback writes disabled.');
  }

  if (props.getProperty('FEEDBACK_TOKEN_SIGNING_KEY')) {
    throw new Error('A signing key already exists. It was not changed.');
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Save production feedback signing key',
    'Paste your freshly generated 64-character key here.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const key = response.getResponseText().trim();

  if (!/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error('Expected exactly 64 hexadecimal characters.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (props.getProperty('FEEDBACK_TOKEN_SIGNING_KEY')) {
      throw new Error('A signing key already exists. It was not changed.');
    }

    props.setProperty('FEEDBACK_TOKEN_SIGNING_KEY', key);

    if (props.getProperty('FEEDBACK_TOKEN_SIGNING_KEY') !== key) {
      throw new Error('Signing key could not be verified.');
    }
  } finally {
    lock.releaseLock();
  }

  ui.alert('Signing key saved and verified.');
}

function checkWhatsAppHandler() {
  console.log(
    'Incoming handler: ' + typeof processIncomingMessageOnce_
  );
  console.log(
    'Status recorder: ' + typeof recordWhatsAppStatus_
  );
  console.log(
    'Status log updater: ' + typeof updateWhatsAppLogFromStatus_
  );
}

function requireVerifiedWhatsAppForwarding() {
  const props = PropertiesService.getScriptProperties();
  const productionId =
    '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4';

  if (
    CONTROL_TOWER_SPREADSHEET_ID !== productionId ||
    props.getProperty('CONTROL_TOWER_SPREADSHEET_ID') !== productionId
  ) {
    throw new Error('Production spreadsheet mismatch');
  }

  props.setProperty('WHATSAPP_REQUIRE_VERIFIED_FORWARD', 'true');

  if (props.getProperty('WHATSAPP_REQUIRE_VERIFIED_FORWARD') !== 'true') {
    throw new Error('Setting did not persist');
  }

  console.log('Verified WhatsApp forwarding required and verified.');
}

function enableProductionFeedbackBackend() {
  const props = PropertiesService.getScriptProperties();
  const productionId =
    '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4';

  if (
    CONTROL_TOWER_SPREADSHEET_ID !== productionId ||
    props.getProperty('CONTROL_TOWER_SPREADSHEET_ID') !== productionId ||
    props.getProperty('WHATSAPP_REQUIRE_VERIFIED_FORWARD') !== 'true' ||
    !props.getProperty('FEEDBACK_TOKEN_SIGNING_KEY') ||
    props.getProperty('FEEDBACK_LIVE_ENABLED') !== 'false' ||
    props.getProperty('FEEDBACK_V2_SENDER_ENABLED') !== 'false'
  ) {
    throw new Error('Production configuration check failed');
  }

  props.setProperty('FEEDBACK_V2_WRITES_ENABLED', 'true');

  if (props.getProperty('FEEDBACK_V2_WRITES_ENABLED') !== 'true') {
    throw new Error('Setting did not persist');
  }

  console.log('Feedback backend enabled. Automatic sending remains off.');
}

function openProductionFeedback016() {
  const ui = SpreadsheetApp.getUi();
  const url = createFeedbackWebLinkForOrder('ORD-000016');
  const safeUrl = url.replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  ui.showModalDialog(
    HtmlService.createHtmlOutput(
      '<p><a href="' + safeUrl +
      '" target="_blank" rel="noopener noreferrer">' +
      'Open feedback for ORD-000016</a></p>'
    ),
    'Production feedback test'
  );
}

function checkFeedback026() {
  console.log(JSON.stringify(
    feedbackDryRunForOrder_('ORD-000026', false)
  ));
}

function prepareWebsiteFeedbackSender() {
  const props = fwProps_();

  if (props.getProperty('FEEDBACK_LIVE_ENABLED') !== 'false') {
    throw new Error('Turn automatic sending off first');
  }

  fwEnabled_();
  fwWebTemplateContract_();

  props.setProperty('FEEDBACK_V2_SENDER_ENABLED', 'true');
  props.setProperty('FEEDBACK_WEB_TEMPLATE_URL_CONFIRMED', 'true');

  console.log(JSON.stringify({
    liveEnabled: feedbackIsLiveEnabled_(),
    sender: props.getProperty('FEEDBACK_V2_SENDER_ENABLED'),
    queue: buildFeedbackQueueSnapshot_().map(item => ({
      orderId: item.orderId,
      allowed: item.allowed,
      reason: item.reason
    }))
  }));
}

function checkPreparedFeedbackSettings() {
  const props = PropertiesService.getScriptProperties();
  [
    'FEEDBACK_LIVE_ENABLED',
    'FEEDBACK_V2_SENDER_ENABLED',
    'FEEDBACK_WEB_TEMPLATE_URL_CONFIRMED'
  ].forEach(name => {
    console.log(name + '=' + props.getProperty(name));
  });
}

function sendFeedback026Only() {
  const props = fwProps_();
  const productionId =
    '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4';

  if (
    CONTROL_TOWER_SPREADSHEET_ID !== productionId ||
    props.getProperty('CONTROL_TOWER_SPREADSHEET_ID') !== productionId ||
    props.getProperty('FEEDBACK_LIVE_ENABLED') !== 'false' ||
    props.getProperty('FEEDBACK_V2_SENDER_ENABLED') !== 'true' ||
    props.getProperty('FEEDBACK_WEB_TEMPLATE_URL_CONFIRMED') !== 'true' ||
    props.getProperty('FEEDBACK_WEB_BASE_URL') !==
      'https://www.makitchens.com.au/feedback/'
  ) {
    throw new Error('Test configuration mismatch');
  }

  fwEnabled_();

  const prepared = fwLock_(() => {
    const book = fwBook_();
    const order = fwOrder_(book, 'ORD-000026');
    const decision = feedbackSenderDecision_(
      order.delivery.table,
      order.delivery.row,
      order.delivery.number,
      Date.now()
    );

    if (!decision.eligible) {
      throw new Error(decision.reason);
    }

    const contact = resolveFeedbackCandidate_(decision.candidate);

    if (!contact.allowed || contact.recipient !== '61420246023') {
      throw new Error('Recipient or consent mismatch');
    }

    const template = fwWebTemplateContract_();
    const link = fwCreateLinkLocked_(
      book,
      fwSchema_(book),
      order.orderId,
      true
    );

    return {
      orderId: order.orderId,
      attemptId: link.attemptId,
      recipient: contact.recipient,
      payload: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: contact.recipient,
        type: 'template',
        template: {
          name: template.name,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: contact.customerFirstName
                },
                {
                  type: 'text',
                  text: order.orderId
                }
              ]
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [
                {
                  type: 'text',
                  text: link.token
                }
              ]
            }
          ]
        }
      }
    };
  });

  let stage = 'PROVIDER_SEND';

  try {
    const id = fwSendWebMessage_(prepared);
    const acceptedAt = new Date();

    stage = 'SAVE_RECEIPT';

    props.setProperty(
      'FEEDBACK_TEST026_RECEIPT',
      JSON.stringify({
        orderId: prepared.orderId,
        messageId: id,
        attemptId: prepared.attemptId,
        acceptedAt: acceptedAt.toISOString()
      })
    );

    stage = 'RECORD_ACCEPTANCE';
    fwAcceptWebMessage_(prepared, id, acceptedAt);

  } catch (err) {
    console.log(JSON.stringify({
      orderId: prepared.orderId,
      stage: stage,
      code: err.code || 'SERVICE_OR_RUNTIME_ERROR',
      errorType: String(err.name || 'Error')
    }));

    throw new Error(
      'Test requires reconciliation. Do not run again.'
    );
  }

  console.log(
    'ORD-000026 message accepted and recorded. ' +
    'Automatic sending remains off.'
  );
}

function diagnoseFeedback026Conflict() {
  const saved = fwProps_().getProperty('FEEDBACK_TEST026_RECEIPT');
  if (!saved) throw new Error('Saved provider receipt missing');

  const receipt = JSON.parse(saved);

  fwLock_(() => {
    const book = fwBook_();
    const state = fwState_(fwSchema_(book), 'ORD-000026', false);
    const log = fwTable_(book, 'WhatsApp Log', WHATSAPP_LOG_HEADERS);
    const matches = log.rows.filter(row => row[0] === receipt.messageId);

    console.log(JSON.stringify({
      attemptMatches: state.row[15] === receipt.attemptId,
      messageMatchesOrBlank:
        !state.row[16] || state.row[16] === receipt.messageId,
      matchingLogRows: matches.length,
      logOrderMatchesOrBlank: matches.every(row =>
        !row[1] || row[1] === 'ORD-000026'
      ),
      logPhoneMatchesOrBlank: matches.every(row =>
        !row[3] ||
        whatsappLogNormalisePhone_(row[3]) === '+61420246023'
      ),
      normaliserResult:
        whatsappLogNormalisePhone_('+61420246023')
    }));
  });
}
function checkRecording026() {
  const saved = fwProps_().getProperty(
    'FEEDBACK_TEST026_RECEIPT'
  );

  if (!saved) throw new Error('Saved provider receipt missing');

  const receipt = JSON.parse(saved);

  if (receipt.orderId !== 'ORD-000026') {
    throw new Error('Unexpected order in saved receipt');
  }

  const state = fwFreshSenderState_(
    fwBook_(),
    receipt.orderId
  );

  console.log(JSON.stringify({
    check: 'LATEST_SAVED_RECEIPT',
    attemptMatches:
      state.row[15] === receipt.attemptId,
    messageMatchesOrBlank:
      !state.row[16] ||
      state.row[16] === receipt.messageId
  }));

  fwAcceptWebMessage_(
    {
      orderId: receipt.orderId,
      attemptId: receipt.attemptId,
      recipient: '61420246023'
    },
    receipt.messageId,
    new Date(receipt.acceptedAt)
  );

  console.log(
    'Saved provider receipt recorded. No message sent.'
  );
}

function enableWebsiteFeedbackLive() {
  const props = fwProps_();

  if (
    props.getProperty('FEEDBACK_V2_SENDER_ENABLED') !== 'true' ||
    props.getProperty('FEEDBACK_V2_WRITES_ENABLED') !== 'true' ||
    props.getProperty('FEEDBACK_WEB_TEMPLATE_URL_CONFIRMED') !== 'true' ||
    props.getProperty('WHATSAPP_REQUIRE_VERIFIED_FORWARD') !== 'true'
  ) {
    throw new Error('Configuration mismatch. Sending remains off.');
  }

  fwEnabled_();
  fwWebTemplateContract_();

  props.setProperty('FEEDBACK_LIVE_ENABLED', 'true');

  console.log('Website feedback sending enabled.');
}
