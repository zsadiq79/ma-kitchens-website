/**
 * MA KITCHENS
 * CONTROL TOWER ROUTIFIC WEBHOOK RECEIVER
 *
 * Receives Routific events only after they have been
 * signature verified by the Ma Kitchens Vercel endpoint.
 *
 * This file intentionally does NOT define doPost(e).
 * Code.gs owns the single project-level doPost(e) router and
 * forwards Routific events here.
 *
 * STAGE 2:
 * - Existing order.status_updated behaviour remains unchanged.
 * - route.published now sends the approved delivery_planned
 *   WhatsApp template for each verified order on the route.
 * - Duplicate protection uses the permanent WhatsApp Log.
 * - No Orders / Order Items / Deliveries lifecycle status is
 *   changed by route.published.
 * - The Stage 1 diagnostic Script Property is still updated.
 */

function handleRoutificWebhook_(e) {

  let lock = null;

  try {

    const properties =
      PropertiesService.getScriptProperties();

    const expectedSecret =
      properties.getProperty(
        'CONTROL_TOWER_WEBHOOK_SECRET'
      );

    if (!expectedSecret) {
      throw new Error(
        'CONTROL_TOWER_WEBHOOK_SECRET is not configured.'
      );
    }

    const rawBody =
      e && e.postData && e.postData.contents
        ? e.postData.contents
        : '';

    if (!rawBody) {
      throw new Error(
        'Webhook body is empty.'
      );
    }

    let forwarded;

    try {
      forwarded = JSON.parse(rawBody);
    } catch (parseError) {
      throw new Error(
        'Webhook body is not valid JSON.'
      );
    }

    const suppliedSecret =
      String(
        forwarded.controlTowerSecret || ''
      );

    if (
      !suppliedSecret ||
      suppliedSecret !== expectedSecret
    ) {
      return routificWebhookResponse_(
        401,
        'Unauthorized Control Tower request.'
      );
    }

    const payload =
      forwarded.payload;

    if (!payload || !payload.type) {
      return routificWebhookResponse_(
        200,
        'Ignored unsupported Routific event.'
      );
    }

    /*
     * ======================================================
     * STAGE 1B — ROUTE PUBLISHED
     *
     * Sends delivery_planned only after:
     * - route timeline order has a valid Ma Kitchens Order ID
     * - permanent Deliveries row exists
     * - stored Routific UUID matches event UUID
     * - Orders row exists and is Confirmed
     * - Customer record exists and WhatsApp Opt-In = Y
     * - no delivery_planned message is already in WhatsApp Log
     *
     * Does NOT change delivery status or other lifecycle fields.
     * ======================================================
     */
    if (payload.type === 'route.published') {

      PropertiesService
        .getScriptProperties()
        .setProperty(
          'ROUTIFIC_LAST_ROUTE_PUBLISHED_TEST',
          JSON.stringify({
            receivedAt:
              new Date().toISOString(),

            eventType:
              payload.type,

            eventId:
              payload.id || null,

            timestamp:
              payload.timestamp || null,

            routeUuid:
              payload.data &&
              payload.data.route &&
              payload.data.route.uuid
                ? payload.data.route.uuid
                : null
          })
        );

      lock =
        LockService.getScriptLock();

      lock.waitLock(30000);

      const result =
        handleRoutePublishedDeliveryPlanned_(
          payload
        );

      return routificWebhookResponse_(
        200,
        'route.published processed safely. ' +
        'delivery_planned sent: ' +
        result.sent +
        ', skipped: ' +
        result.skipped +
        ', errors: ' +
        result.errors +
        '.'
      );
    }


    /*
     * ======================================================
     * STAGE 2 — ROUTE ETA UPDATED / OUT FOR DELIVERY
     *
     * Only acts when the route is executing and Routific has
     * recorded an actual route departure.
     *
     * Sends delivery_update_2 once per order, including the
     * real Routific tracking link.
     *
     * No Orders / Deliveries lifecycle status is changed here.
     * ======================================================
     */
    if (payload.type === 'route.eta_updated') {

      const route =
        payload &&
        payload.data &&
        payload.data.route
          ? payload.data.route
          : null;

      const timeline =
        payload &&
        payload.data &&
        Array.isArray(payload.data.timeline)
          ? payload.data.timeline
          : [];

      const started =
        route &&
        String(route.status || '').toLowerCase() === 'executing' &&
        timeline.some(function(stop) {
          return (
            stop &&
            stop.type === 'start_location' &&
            stop.actualDepartureTime
          );
        });

      if (!started) {
        return routificWebhookResponse_(
          200,
          'route.eta_updated ignored because route has not started.'
        );
      }

      PropertiesService
        .getScriptProperties()
        .setProperty(
          'ROUTIFIC_LAST_ETA_UPDATED_TEST',
          JSON.stringify({
            receivedAt:
              new Date().toISOString(),
            timestamp:
              payload.timestamp || null,
            routeUuid:
              route && route.uuid
                ? route.uuid
                : null,
            routeStatus:
              route && route.status
                ? route.status
                : null
          })
        );

      lock =
        LockService.getScriptLock();

      lock.waitLock(30000);

      const result =
        handleRouteEtaUpdatedDeliveryUpdate_(
          payload
        );

      return routificWebhookResponse_(
        200,
        'route.eta_updated processed safely. ' +
        'delivery_update_2 sent: ' +
        result.sent +
        ', skipped: ' +
        result.skipped +
        ', errors: ' +
        result.errors +
        (result.errorDetails && result.errorDetails.length
          ? ' | ' + result.errorDetails.join(' || ')
          : '')
      );
    }


    /*
     * ======================================================
     * EXISTING PRODUCTION LOGIC BELOW
     *
     * order.status_updated behaviour intentionally preserved.
     * ======================================================
     */

    if (
      payload.type !== 'order.status_updated'
    ) {
      return routificWebhookResponse_(
        200,
        'Ignored unsupported Routific event.'
      );
    }

    const order =
      payload.data &&
      payload.data.order
        ? payload.data.order
        : null;

    if (!order) {
      throw new Error(
        'Routific event does not contain order data.'
      );
    }

    const orderId =
      String(
        order.customerOrderNumber || ''
      ).trim();

    const routificUuid =
      String(
        order.uuid || ''
      ).trim();

    const routificStatus =
      String(
        order.status || ''
      ).trim()
        .toLowerCase();

    if (!orderId) {
      throw new Error(
        'Routific event has no customerOrderNumber.'
      );
    }

    if (!routificUuid) {
      throw new Error(
        'Routific event has no order UUID.'
      );
    }

    if (!/^ORD-\d+$/.test(orderId)) {
      return routificWebhookResponse_(
        200,
        'Ignored non-Control-Tower test order: ' +
        orderId
      );
    }

    let deliveryStatus;

    if (routificStatus === 'delivered') {
      deliveryStatus = 'Delivered';
    } else if (routificStatus === 'missed') {
      deliveryStatus = 'Failed';
    } else {
      return routificWebhookResponse_(
        200,
        'Ignored unsupported Routific status: ' +
        routificStatus
      );
    }

    let deliveredAt = null;

    if (
      routificStatus === 'delivered' &&
      order.deliveryTime
    ) {
      deliveredAt =
        new Date(order.deliveryTime);

      if (isNaN(deliveredAt.getTime())) {
        throw new Error(
          'Invalid Routific deliveryTime for ' +
          orderId
        );
      }
    }

    const deliveryNotes =
      String(
        order.deliveryNotes || ''
      ).trim();

    const missedReason =
      String(
        order.deliveryMissedReason || ''
      ).trim();

    let notesToStore = '';

    if (routificStatus === 'missed') {

      if (missedReason && deliveryNotes) {
        notesToStore =
          'Missed: ' +
          missedReason +
          ' | ' +
          deliveryNotes;
      } else if (missedReason) {
        notesToStore =
          'Missed: ' +
          missedReason;
      } else if (deliveryNotes) {
        notesToStore =
          deliveryNotes;
      }

    } else if (deliveryNotes) {
      notesToStore =
        deliveryNotes;
    }

    lock =
      LockService.getScriptLock();

    lock.waitLock(30000);

    const ss =
      SpreadsheetApp.openById(
        CONTROL_TOWER_SPREADSHEET_ID
      );

    const deliveriesSheet =
      ss.getSheetByName('Deliveries');

    if (!deliveriesSheet) {
      throw new Error(
        'Deliveries sheet was not found.'
      );
    }

    const maxRows =
      deliveriesSheet.getMaxRows();

    const orderIds =
      deliveriesSheet
        .getRange(
          2,
          2,
          maxRows - 1,
          1
        )
        .getValues();

    let deliveryRow = null;

    for (
      let i = 0;
      i < orderIds.length;
      i++
    ) {

      if (
        String(
          orderIds[i][0] || ''
        ).trim() === orderId
      ) {

        deliveryRow = i + 2;
        break;
      }
    }

    if (!deliveryRow) {
      return routificWebhookResponse_(
        200,
        'No permanent Deliveries row found for ' +
        orderId +
        '. No update performed.'
      );
    }

    const storedRoutificUuid =
      String(
        deliveriesSheet
          .getRange(deliveryRow, 14)
          .getValue() || ''
      ).trim();

    if (!storedRoutificUuid) {
      throw new Error(
        'Delivery record for ' +
        orderId +
        ' has no stored Routific UUID.'
      );
    }

    if (storedRoutificUuid !== routificUuid) {
      throw new Error(
        'Routific UUID mismatch for ' +
        orderId +
        '. Control Tower was not updated.'
      );
    }

    const currentDeliveryStatus =
      String(
        deliveriesSheet
          .getRange(deliveryRow, 6)
          .getDisplayValue() || ''
      ).trim();

    if (
      currentDeliveryStatus === 'Delivered' &&
      deliveryStatus === 'Failed'
    ) {
      return routificWebhookResponse_(
        200,
        'Ignored stale missed event for already Delivered ' +
        orderId +
        '.'
      );
    }

    deliveriesSheet
      .getRange(deliveryRow, 6)
      .setValue(deliveryStatus);

    if (
      routificStatus === 'delivered' &&
      deliveredAt
    ) {
      deliveriesSheet
        .getRange(deliveryRow, 8)
        .setValue(deliveredAt);
    }

    if (notesToStore) {
      deliveriesSheet
        .getRange(deliveryRow, 9)
        .setValue(notesToStore);
    }

    SpreadsheetApp.flush();

    if (
      routificStatus === 'delivered'
    ) {
      sendDeliveryConfirmationForOrder_(
        orderId
      );
    }

    PropertiesService
      .getScriptProperties()
      .setProperty(
        'ROUTIFIC_LAST_VERIFIED_CONTROL_TOWER_EVENT',
        JSON.stringify({
          receivedAt:
            new Date().toISOString(),

          orderId:
            orderId,

          routificUuid:
            routificUuid,

          status:
            routificStatus,

          deliveryTime:
            order.deliveryTime || null,

          deliveryRow:
            deliveryRow
        })
      );

    return routificWebhookResponse_(
      200,
      'Control Tower delivery updated successfully for ' +
      orderId +
      '.'
    );

  } catch (error) {

    console.error(
      'CONTROL TOWER WEBHOOK ERROR: ' +
      error.message
    );

    return routificWebhookResponse_(
      500,
      error.message
    );

  } finally {

    if (lock) {
      try {
        lock.releaseLock();
      } catch (lockError) {
        console.error(
          'Could not release Routific webhook lock: ' +
          lockError.message
        );
      }
    }
  }
}


/* =========================================================
   STAGE 1B — ROUTE.PUBLISHED DELIVERY PLANNED
   ========================================================= */

function handleRoutePublishedDeliveryPlanned_(
  payload
) {

  const route =
    payload &&
    payload.data &&
    payload.data.route
      ? payload.data.route
      : null;

  const timeline =
    payload &&
    payload.data &&
    Array.isArray(payload.data.timeline)
      ? payload.data.timeline
      : [];

  if (!route) {
    throw new Error(
      'route.published event does not contain route data.'
    );
  }

  const ss =
    SpreadsheetApp.openById(
      CONTROL_TOWER_SPREADSHEET_ID
    );

  const ordersSheet =
    ss.getSheetByName('Orders');

  const deliveriesSheet =
    ss.getSheetByName('Deliveries');

  const customersSheet =
    ss.getSheetByName('Customers');

  if (
    !ordersSheet ||
    !deliveriesSheet ||
    !customersSheet
  ) {
    throw new Error(
      'Required Control Tower sheet was not found.'
    );
  }

  const orderValues =
    ordersSheet
      .getDataRange()
      .getValues();

  const deliveryValues =
    deliveriesSheet
      .getDataRange()
      .getValues();

  const customerValues =
    customersSheet
      .getDataRange()
      .getValues();

  if (
    orderValues.length < 2 ||
    deliveryValues.length < 2 ||
    customerValues.length < 2
  ) {
    throw new Error(
      'Control Tower data is incomplete.'
    );
  }

  const orderColumns =
    routePublishedHeaderMap_(
      orderValues[0]
    );

  const deliveryColumns =
    routePublishedHeaderMap_(
      deliveryValues[0]
    );

  const customerColumns =
    routePublishedHeaderMap_(
      customerValues[0]
    );

  [
    'Order ID',
    'Delivery Date',
    'Customer ID',
    'Customer Name',
    'Phone',
    'Order Status',
    'Delivery Window'
  ].forEach(function(header) {
    routePublishedRequireColumn_(
      orderColumns,
      header,
      'Orders'
    );
  });

  [
    'Order ID',
    'Routific ID'
  ].forEach(function(header) {
    routePublishedRequireColumn_(
      deliveryColumns,
      header,
      'Deliveries'
    );
  });

  [
    'Customer ID',
    'Name',
    'Phone',
    'WhatsApp Opt-In'
  ].forEach(function(header) {
    routePublishedRequireColumn_(
      customerColumns,
      header,
      'Customers'
    );
  });

  const orderMap = {};

  for (
    let i = 1;
    i < orderValues.length;
    i++
  ) {

    const row =
      orderValues[i];

    const orderId =
      String(
        row[orderColumns['Order ID']] || ''
      ).trim();

    if (!orderId) {
      continue;
    }

    orderMap[orderId] = row;
  }

  const deliveryMap = {};

  for (
    let i = 1;
    i < deliveryValues.length;
    i++
  ) {

    const row =
      deliveryValues[i];

    const orderId =
      String(
        row[deliveryColumns['Order ID']] || ''
      ).trim();

    if (!orderId) {
      continue;
    }

    deliveryMap[orderId] = row;
  }

  const customerMap = {};

  for (
    let i = 1;
    i < customerValues.length;
    i++
  ) {

    const row =
      customerValues[i];

    const customerId =
      String(
        row[customerColumns['Customer ID']] || ''
      ).trim();

    if (!customerId) {
      continue;
    }

    customerMap[customerId] = row;
  }

  const routeOrders = [];

  timeline.forEach(function(stop) {

    if (
      !stop ||
      !Array.isArray(stop.orders)
    ) {
      return;
    }

    stop.orders.forEach(function(order) {

      const orderId =
        String(
          order &&
          order.customerOrderNumber
            ? order.customerOrderNumber
            : ''
        ).trim();

      const routificUuid =
        String(
          order &&
          order.uuid
            ? order.uuid
            : ''
        ).trim();

      if (
        !/^ORD-\d+$/.test(orderId) ||
        !routificUuid
      ) {
        return;
      }

      routeOrders.push({
        orderId: orderId,
        routificUuid: routificUuid
      });
    });
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;


  const seen = {};

  routeOrders.forEach(function(routeOrder) {

    const orderId =
      routeOrder.orderId;

    if (seen[orderId]) {
      skipped++;
      return;
    }

    seen[orderId] = true;

    try {

      const deliveryRow =
        deliveryMap[orderId];

      if (!deliveryRow) {
        console.log(
          'delivery_planned skipped for ' +
          orderId +
          ': no permanent Deliveries row.'
        );

        skipped++;
        return;
      }

      const storedRoutificUuid =
        String(
          deliveryRow[
            deliveryColumns['Routific ID']
          ] || ''
        ).trim();

      if (
        !storedRoutificUuid ||
        storedRoutificUuid !==
          routeOrder.routificUuid
      ) {
        console.log(
          'delivery_planned skipped for ' +
          orderId +
          ': Routific UUID mismatch.'
        );

        skipped++;
        return;
      }

      const orderRow =
        orderMap[orderId];

      if (!orderRow) {
        console.log(
          'delivery_planned skipped for ' +
          orderId +
          ': Orders row not found.'
        );

        skipped++;
        return;
      }

      const orderStatus =
        String(
          orderRow[
            orderColumns['Order Status']
          ] || ''
        ).trim();

      if (orderStatus !== 'Confirmed') {
        console.log(
          'delivery_planned skipped for ' +
          orderId +
          ': Order Status is not Confirmed.'
        );

        skipped++;
        return;
      }

      if (
        deliveryPlannedAlreadyLogged_(
          orderId
        )
      ) {
        console.log(
          'delivery_planned duplicate blocked for ' +
          orderId +
          '.'
        );

        skipped++;
        return;
      }

      const customerId =
        String(
          orderRow[
            orderColumns['Customer ID']
          ] || ''
        ).trim();

      const customerRow =
        customerMap[customerId];

      if (!customerRow) {
        console.log(
          'delivery_planned skipped for ' +
          orderId +
          ': customer record not found.'
        );

        skipped++;
        return;
      }

      const whatsappOptIn =
        String(
          customerRow[
            customerColumns[
              'WhatsApp Opt-In'
            ]
          ] || ''
        ).trim()
          .toUpperCase();

      if (whatsappOptIn !== 'Y') {
        console.log(
          'delivery_planned skipped for ' +
          orderId +
          ': WhatsApp Opt-In is not Y.'
        );

        skipped++;
        return;
      }

      const customerName =
        String(
          orderRow[
            orderColumns['Customer Name']
          ] || ''
        ).trim() ||
        String(
          customerRow[
            customerColumns['Name']
          ] || ''
        ).trim();

      const rawPhone =
        String(
          orderRow[
            orderColumns['Phone']
          ] || ''
        ).trim() ||
        String(
          customerRow[
            customerColumns['Phone']
          ] || ''
        ).trim();

      const recipient =
        routePublishedNormalisePhone_(
          rawPhone
        );

      if (!/^614\d{8}$/.test(recipient)) {
        console.log(
          'delivery_planned skipped for ' +
          orderId +
          ': invalid Australian mobile number.'
        );

        skipped++;
        return;
      }

      const firstName =
        routePublishedFirstName_(
          customerName
        );

      if (!firstName) {
        console.log(
          'delivery_planned skipped for ' +
          orderId +
          ': customer name missing.'
        );

        skipped++;
        return;
      }

      const deliveryDate =
        orderRow[
          orderColumns['Delivery Date']
        ];

      if (
        !(deliveryDate instanceof Date) ||
        isNaN(deliveryDate.getTime())
      ) {
        console.log(
          'delivery_planned skipped for ' +
          orderId +
          ': invalid delivery date.'
        );

        skipped++;
        return;
      }

      const timeZone =
        ss.getSpreadsheetTimeZone() ||
        'Australia/Sydney';

      const deliveryDateDisplay =
        Utilities.formatDate(
          deliveryDate,
          timeZone,
          'd MMMM'
        );

      const deliveryWindow =
        String(
          orderRow[
            orderColumns['Delivery Window']
          ] || ''
        ).trim();

      const parsedWindow =
        routePublishedFormatWindow_(
          deliveryWindow
        );

      const sendResult =
        sendDeliveryPlannedTemplate_(
          recipient,
          firstName,
          orderId,
          deliveryDateDisplay,
          parsedWindow.startDisplay,
          parsedWindow.endDisplay
        );

      const now =
        new Date();

      registerWhatsAppOutbound_(
        sendResult.messageId,
        orderId,
        'delivery_planned',
        recipient,
        now
      );

      console.log(
        'delivery_planned sent for ' +
        orderId +
        ' | message ' +
        sendResult.messageId
      );

      sent++;

    } catch (err) {

      console.error(
        'delivery_planned error for ' +
        orderId +
        ': ' +
        (err.stack || err)
      );

      errors++;
    }
  });

  return {
    routeUuid:
      String(route.uuid || '').trim(),
    routeOrders:
      routeOrders.length,
    sent: sent,
    skipped: skipped,
    errors: errors
  };
}


/* =========================================================
   SEND APPROVED DELIVERY_PLANNED TEMPLATE
   ========================================================= */

function sendDeliveryPlannedTemplate_(
  recipient,
  firstName,
  orderId,
  deliveryDateDisplay,
  startDisplay,
  endDisplay
) {

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: 'delivery_planned',
      language: {
        code: 'en'
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: firstName
            },
            {
              type: 'text',
              text: orderId
            },
            {
              type: 'text',
              text: deliveryDateDisplay
            },
            {
              type: 'text',
              text: startDisplay
            },
            {
              type: 'text',
              text: endDisplay
            }
          ]
        }
      ]
    }
  };

  const responseText =
    sendWhatsAppPayload_(
      payload
    );

  let responseJson = {};

  try {
    responseJson =
      JSON.parse(responseText);
  } catch (err) {
    throw new Error(
      'delivery_planned was accepted, ' +
      'but the Meta response could not be parsed.'
    );
  }

  const messageId =
    responseJson &&
    responseJson.messages &&
    responseJson.messages[0] &&
    responseJson.messages[0].id
      ? String(
          responseJson.messages[0].id
        )
      : '';

  if (!messageId) {
    throw new Error(
      'delivery_planned response did not contain a message ID.'
    );
  }

  return {
    messageId: messageId,
    rawResponse: responseJson
  };
}


/* =========================================================
   DUPLICATE PROTECTION
   ========================================================= */

function deliveryPlannedAlreadyLogged_(
  orderId
) {

  const ss =
    SpreadsheetApp.openById(
      CONTROL_TOWER_SPREADSHEET_ID
    );

  const sheet =
    ss.getSheetByName(
      'WhatsApp Log'
    );

  if (!sheet) {
    throw new Error(
      'WhatsApp Log sheet was not found.'
    );
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const values =
    sheet
      .getRange(
        2,
        2,
        lastRow - 1,
        2
      )
      .getDisplayValues();

  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    const loggedOrderId =
      String(
        values[i][0] || ''
      ).trim();

    const messageType =
      String(
        values[i][1] || ''
      ).trim();

    if (
      loggedOrderId === orderId &&
      messageType === 'delivery_planned'
    ) {
      return true;
    }
  }

  return false;
}


/* =========================================================
   ROUTE.PUBLISHED HELPERS
   ========================================================= */

function routePublishedHeaderMap_(
  headers
) {

  const map = {};

  headers.forEach(
    function(header, index) {
      map[
        String(header || '').trim()
      ] = index;
    }
  );

  return map;
}


function routePublishedRequireColumn_(
  map,
  header,
  sheetName
) {

  if (
    !Object.prototype.hasOwnProperty.call(
      map,
      header
    )
  ) {
    throw new Error(
      sheetName +
      ' is missing required column: ' +
      header
    );
  }
}


function routePublishedNormalisePhone_(
  rawPhone
) {

  let digits =
    String(
      rawPhone || ''
    ).replace(
      /\D/g,
      ''
    );

  if (
    digits.indexOf('04') === 0 &&
    digits.length === 10
  ) {
    digits =
      '61' +
      digits.substring(1);
  }

  if (
    digits.indexOf('4') === 0 &&
    digits.length === 9
  ) {
    digits =
      '61' +
      digits;
  }

  return digits;
}


function routePublishedFirstName_(
  fullName
) {

  const text =
    String(
      fullName || ''
    ).trim();

  if (!text) {
    return '';
  }

  return text.split(/\s+/)[0];
}


function routePublishedFormatWindow_(
  deliveryWindow
) {

  const text =
    String(
      deliveryWindow || ''
    )
      .trim()
      .replace(/–/g, '-')
      .replace(/—/g, '-');

  const match =
    text.match(
      /^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*$/i
    );

  if (!match) {
    throw new Error(
      'Unsupported Delivery Window: ' +
      deliveryWindow
    );
  }

  const startHour =
    Number(match[1]);

  const startMinute =
    Number(match[2] || 0);

  let startMeridiem =
    String(
      match[3] || ''
    ).toUpperCase();

  const endHour =
    Number(match[4]);

  const endMinute =
    Number(match[5] || 0);

  const endMeridiem =
    String(
      match[6] || ''
    ).toUpperCase();

  if (!startMeridiem) {
    startMeridiem =
      endMeridiem;
  }

  if (
    startHour < 1 ||
    startHour > 12 ||
    endHour < 1 ||
    endHour > 12 ||
    startMinute < 0 ||
    startMinute > 59 ||
    endMinute < 0 ||
    endMinute > 59
  ) {
    throw new Error(
      'Invalid Delivery Window: ' +
      deliveryWindow
    );
  }

  return {
    startDisplay:
      startHour +
      ':' +
      String(startMinute)
        .padStart(2, '0') +
      ' ' +
      startMeridiem,

    endDisplay:
      endHour +
      ':' +
      String(endMinute)
        .padStart(2, '0') +
      ' ' +
      endMeridiem
  };
}



/* =========================================================
   STAGE 2 — ROUTE.ETA_UPDATED / DELIVERY UPDATE
   ========================================================= */

function handleRouteEtaUpdatedDeliveryUpdate_(
  payload
) {

  const route =
    payload &&
    payload.data &&
    payload.data.route
      ? payload.data.route
      : null;

  const timeline =
    payload &&
    payload.data &&
    Array.isArray(payload.data.timeline)
      ? payload.data.timeline
      : [];

  if (!route) {
    throw new Error(
      'route.eta_updated event does not contain route data.'
    );
  }

  const ss =
    SpreadsheetApp.openById(
      CONTROL_TOWER_SPREADSHEET_ID
    );

  const ordersSheet =
    ss.getSheetByName('Orders');

  const deliveriesSheet =
    ss.getSheetByName('Deliveries');

  const customersSheet =
    ss.getSheetByName('Customers');

  if (
    !ordersSheet ||
    !deliveriesSheet ||
    !customersSheet
  ) {
    throw new Error(
      'Required Control Tower sheet was not found.'
    );
  }

  const orderValues =
    ordersSheet
      .getDataRange()
      .getValues();

  const deliveryValues =
    deliveriesSheet
      .getDataRange()
      .getValues();

  const customerValues =
    customersSheet
      .getDataRange()
      .getValues();

  const orderColumns =
    routePublishedHeaderMap_(
      orderValues[0]
    );

  const deliveryColumns =
    routePublishedHeaderMap_(
      deliveryValues[0]
    );

  const customerColumns =
    routePublishedHeaderMap_(
      customerValues[0]
    );

  [
    'Order ID',
    'Delivery Date',
    'Customer ID',
    'Customer Name',
    'Phone',
    'Order Status',
    'Delivery Window'
  ].forEach(function(header) {
    routePublishedRequireColumn_(
      orderColumns,
      header,
      'Orders'
    );
  });

  [
    'Order ID',
    'Routific ID'
  ].forEach(function(header) {
    routePublishedRequireColumn_(
      deliveryColumns,
      header,
      'Deliveries'
    );
  });

  [
    'Customer ID',
    'Name',
    'Phone',
    'WhatsApp Opt-In'
  ].forEach(function(header) {
    routePublishedRequireColumn_(
      customerColumns,
      header,
      'Customers'
    );
  });

  const orderMap = {};

  for (
    let i = 1;
    i < orderValues.length;
    i++
  ) {
    const row = orderValues[i];

    const orderId =
      String(
        row[orderColumns['Order ID']] || ''
      ).trim();

    if (orderId) {
      orderMap[orderId] = row;
    }
  }

  const deliveryMap = {};

  for (
    let i = 1;
    i < deliveryValues.length;
    i++
  ) {
    const row = deliveryValues[i];

    const orderId =
      String(
        row[deliveryColumns['Order ID']] || ''
      ).trim();

    if (orderId) {
      deliveryMap[orderId] = row;
    }
  }

  const customerMap = {};

  for (
    let i = 1;
    i < customerValues.length;
    i++
  ) {
    const row = customerValues[i];

    const customerId =
      String(
        row[customerColumns['Customer ID']] || ''
      ).trim();

    if (customerId) {
      customerMap[customerId] = row;
    }
  }

  const routeOrders = [];

  timeline.forEach(function(stop) {

    if (
      !stop ||
      !Array.isArray(stop.orders)
    ) {
      return;
    }

    stop.orders.forEach(function(order) {

      const orderId =
        String(
          order &&
          order.customerOrderNumber
            ? order.customerOrderNumber
            : ''
        ).trim();

      const routificUuid =
        String(
          order &&
          order.uuid
            ? order.uuid
            : ''
        ).trim();

      const status =
        String(
          order &&
          order.status
            ? order.status
            : ''
        ).trim()
          .toLowerCase();

      if (
        !/^ORD-\d+$/.test(orderId) ||
        !routificUuid ||
        status !== 'scheduled'
      ) {
        return;
      }

      routeOrders.push({
        orderId: orderId,
        routificUuid: routificUuid
      });
    });
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const stage2Errors = [];

  const seen = {};

  routeOrders.forEach(function(routeOrder) {

    const orderId =
      routeOrder.orderId;

    if (seen[orderId]) {
      skipped++;
      return;
    }

    seen[orderId] = true;

    try {

      const deliveryRow =
        deliveryMap[orderId];

      if (!deliveryRow) {
        console.log(
          'delivery_update_2 skipped for ' +
          orderId +
          ': no permanent Deliveries row.'
        );

        skipped++;
        return;
      }

      const storedRoutificUuid =
        String(
          deliveryRow[
            deliveryColumns['Routific ID']
          ] || ''
        ).trim();

      if (
        !storedRoutificUuid ||
        storedRoutificUuid !==
          routeOrder.routificUuid
      ) {
        console.log(
          'delivery_update_2 skipped for ' +
          orderId +
          ': Routific UUID mismatch.'
        );

        skipped++;
        return;
      }

      const orderRow =
        orderMap[orderId];

      if (!orderRow) {
        console.log(
          'delivery_update_2 skipped for ' +
          orderId +
          ': Orders row not found.'
        );

        skipped++;
        return;
      }

      const orderStatus =
        String(
          orderRow[
            orderColumns['Order Status']
          ] || ''
        ).trim();

      if (orderStatus !== 'Confirmed') {
        console.log(
          'delivery_update_2 skipped for ' +
          orderId +
          ': Order Status is not Confirmed.'
        );

        skipped++;
        return;
      }

      if (
        deliveryUpdateAlreadyLogged_(
          orderId
        )
      ) {
        console.log(
          'delivery_update_2 duplicate blocked for ' +
          orderId +
          '.'
        );

        skipped++;
        return;
      }

      const customerId =
        String(
          orderRow[
            orderColumns['Customer ID']
          ] || ''
        ).trim();

      const customerRow =
        customerMap[customerId];

      if (!customerRow) {
        console.log(
          'delivery_update_2 skipped for ' +
          orderId +
          ': customer record not found.'
        );

        skipped++;
        return;
      }

      const whatsappOptIn =
        String(
          customerRow[
            customerColumns[
              'WhatsApp Opt-In'
            ]
          ] || ''
        ).trim()
          .toUpperCase();

      if (whatsappOptIn !== 'Y') {
        console.log(
          'delivery_update_2 skipped for ' +
          orderId +
          ': WhatsApp Opt-In is not Y.'
        );

        skipped++;
        return;
      }

      const customerName =
        String(
          orderRow[
            orderColumns['Customer Name']
          ] || ''
        ).trim() ||
        String(
          customerRow[
            customerColumns['Name']
          ] || ''
        ).trim();

      const rawPhone =
        String(
          orderRow[
            orderColumns['Phone']
          ] || ''
        ).trim() ||
        String(
          customerRow[
            customerColumns['Phone']
          ] || ''
        ).trim();

      const recipient =
        routePublishedNormalisePhone_(
          rawPhone
        );

      if (!/^614\d{8}$/.test(recipient)) {
        console.log(
          'delivery_update_2 skipped for ' +
          orderId +
          ': invalid Australian mobile number.'
        );

        skipped++;
        return;
      }

      const firstName =
        routePublishedFirstName_(
          customerName
        );

      if (!firstName) {
        console.log(
          'delivery_update_2 skipped for ' +
          orderId +
          ': customer name missing.'
        );

        skipped++;
        return;
      }

      const deliveryDate =
        orderRow[
          orderColumns['Delivery Date']
        ];

      if (
        !(deliveryDate instanceof Date) ||
        isNaN(deliveryDate.getTime())
      ) {
        console.log(
          'delivery_update_2 skipped for ' +
          orderId +
          ': invalid delivery date.'
        );

        skipped++;
        return;
      }

      const timeZone =
        ss.getSpreadsheetTimeZone() ||
        'Australia/Sydney';

      const deliveryDateDisplay =
        Utilities.formatDate(
          deliveryDate,
          timeZone,
          'd MMMM'
        );

      const deliveryWindow =
        String(
          orderRow[
            orderColumns['Delivery Window']
          ] || ''
        ).trim();

      const parsedWindow =
        routePublishedFormatWindow_(
          deliveryWindow
        );

      const tracking =
        fetchRoutificTracking_(
          routeOrder.routificUuid
        );

      const sendResult =
        sendDeliveryUpdateTemplate_(
          recipient,
          firstName,
          orderId,
          deliveryDateDisplay,
          parsedWindow.startDisplay,
          parsedWindow.endDisplay,
          tracking.buttonSuffix
        );

      const now =
        new Date();

      registerWhatsAppOutbound_(
        sendResult.messageId,
        orderId,
        'delivery_update_2',
        recipient,
        now
      );

      console.log(
        'delivery_update_2 sent for ' +
        orderId +
        ' | message ' +
        sendResult.messageId +
        ' | tracking ' +
        tracking.shortUrl
      );

      sent++;

    } catch (err) {

      const errorText =
        err && err.message
          ? String(err.message)
          : String(err);

      console.error(
        'delivery_update_2 error for ' +
        orderId +
        ': ' +
        (err.stack || err)
      );

      stage2Errors.push({
        orderId: orderId,
        routificUuid:
          routeOrder.routificUuid,
        error: errorText
      });

      errors++;
    }
  });

  

  return {
    routeUuid:
      String(route.uuid || '').trim(),
    routeOrders:
      routeOrders.length,
    sent: sent,
    skipped: skipped,
    errors: errors,
    errorDetails:
      stage2Errors.map(function(item) {
        return item.orderId + ': ' + item.error;
      })
  };
}


/* =========================================================
   FETCH REAL ROUTIFIC TRACKING LINK
   ========================================================= */

function fetchRoutificTracking_(
  routificUuid
) {

  const token =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'ROUTIFIC_API_TOKEN'
      );

  if (!token) {
    throw new Error(
      'ROUTIFIC_API_TOKEN was not found in Script Properties.'
    );
  }

  const response =
    UrlFetchApp.fetch(
      'https://api.plan.routific.com/v2/orders/' +
      encodeURIComponent(routificUuid),
      {
        method: 'get',
        headers: {
          Authorization:
            'Bearer ' + token,
          Accept:
            'application/json'
        },
        muteHttpExceptions: true
      }
    );

  const statusCode =
    response.getResponseCode();

  const body =
    response.getContentText();

  if (
    statusCode < 200 ||
    statusCode >= 300
  ) {
    throw new Error(
      'Routific fetch order failed. HTTP ' +
      statusCode +
      ': ' +
      body
    );
  }

  let data = {};

  try {
    data = JSON.parse(body);
  } catch (err) {
    throw new Error(
      'Routific fetch order response was not valid JSON.'
    );
  }

  const shortUrl =
    data &&
    data.deliveryTracking &&
    data.deliveryTracking.shortUrl
      ? String(
          data.deliveryTracking.shortUrl
        ).trim()
      : '';

  if (!shortUrl) {
    throw new Error(
      'Routific order has no deliveryTracking.shortUrl.'
    );
  }

  const prefix =
    'https://routi.fi/';

  if (
    shortUrl.indexOf(prefix) !== 0
  ) {
    throw new Error(
      'Unexpected Routific tracking URL: ' +
      shortUrl
    );
  }

  const suffix =
    shortUrl.substring(
      prefix.length
    );

  if (!suffix) {
    throw new Error(
      'Routific tracking URL suffix is empty.'
    );
  }

  return {
    shortUrl: shortUrl,
    buttonSuffix: suffix
  };
}


/* =========================================================
   SEND APPROVED DELIVERY_UPDATE_2 TEMPLATE
   Dynamic URL button base configured in Meta:
   https://routi.fi/{{1}}
   ========================================================= */

function sendDeliveryUpdateTemplate_(
  recipient,
  firstName,
  orderId,
  deliveryDateDisplay,
  startDisplay,
  endDisplay,
  trackingButtonSuffix
) {

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: 'delivery_update_2',
      language: {
        code: 'en_US'
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: firstName
            },
            {
              type: 'text',
              text: orderId
            },
            {
              type: 'text',
              text: deliveryDateDisplay
            },
            {
              type: 'text',
              text: startDisplay
            },
            {
              type: 'text',
              text: endDisplay
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
              text: trackingButtonSuffix
            }
          ]
        }
      ]
    }
  };

  const responseText =
    sendWhatsAppPayload_(
      payload
    );

  let responseJson = {};

  try {
    responseJson =
      JSON.parse(responseText);
  } catch (err) {
    throw new Error(
      'delivery_update_2 was accepted, ' +
      'but the Meta response could not be parsed.'
    );
  }

  const messageId =
    responseJson &&
    responseJson.messages &&
    responseJson.messages[0] &&
    responseJson.messages[0].id
      ? String(
          responseJson.messages[0].id
        )
      : '';

  if (!messageId) {
    throw new Error(
      'delivery_update_2 response did not contain a message ID.'
    );
  }

  return {
    messageId: messageId,
    rawResponse: responseJson
  };
}


/* =========================================================
   STAGE 2 DUPLICATE PROTECTION
   ========================================================= */

function deliveryUpdateAlreadyLogged_(
  orderId
) {

  const ss =
    SpreadsheetApp.openById(
      CONTROL_TOWER_SPREADSHEET_ID
    );

  const sheet =
    ss.getSheetByName(
      'WhatsApp Log'
    );

  if (!sheet) {
    throw new Error(
      'WhatsApp Log sheet was not found.'
    );
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const values =
    sheet
      .getRange(
        2,
        2,
        lastRow - 1,
        2
      )
      .getDisplayValues();

  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    const loggedOrderId =
      String(
        values[i][0] || ''
      ).trim();

    const messageType =
      String(
        values[i][1] || ''
      ).trim();

    if (
      loggedOrderId === orderId &&
      messageType === 'delivery_update_2'
    ) {
      return true;
    }
  }

  return false;
}




/* =========================================================
   STAGE 3 — DELIVERED WHATSAPP CONFIRMATION
   ========================================================= */

function sendDeliveryConfirmationForOrder_(
  orderId
) {

  if (
    deliveryConfirmationAlreadyLogged_(
      orderId
    )
  ) {
    console.log(
      'delivery_confirmation_5 duplicate blocked for ' +
      orderId +
      '.'
    );

    return {
      sent: false,
      duplicate: true
    };
  }

  const ss =
    SpreadsheetApp.openById(
      CONTROL_TOWER_SPREADSHEET_ID
    );

  const ordersSheet =
    ss.getSheetByName('Orders');

  const customersSheet =
    ss.getSheetByName('Customers');

  if (!ordersSheet || !customersSheet) {
    throw new Error(
      'Orders or Customers sheet was not found.'
    );
  }

  const orderValues =
    ordersSheet
      .getDataRange()
      .getValues();

  const customerValues =
    customersSheet
      .getDataRange()
      .getValues();

  const orderColumns =
    routePublishedHeaderMap_(
      orderValues[0]
    );

  const customerColumns =
    routePublishedHeaderMap_(
      customerValues[0]
    );

  [
    'Order ID',
    'Customer ID',
    'Customer Name',
    'Phone'
  ].forEach(function(header) {
    routePublishedRequireColumn_(
      orderColumns,
      header,
      'Orders'
    );
  });

  [
    'Customer ID',
    'Name',
    'Phone',
    'WhatsApp Opt-In'
  ].forEach(function(header) {
    routePublishedRequireColumn_(
      customerColumns,
      header,
      'Customers'
    );
  });

  let orderRow = null;

  for (
    let i = 1;
    i < orderValues.length;
    i++
  ) {

    if (
      String(
        orderValues[i][
          orderColumns['Order ID']
        ] || ''
      ).trim() === orderId
    ) {
      orderRow =
        orderValues[i];

      break;
    }
  }

  if (!orderRow) {
    throw new Error(
      'Orders row not found for ' +
      orderId +
      '.'
    );
  }

  const customerId =
    String(
      orderRow[
        orderColumns['Customer ID']
      ] || ''
    ).trim();

  let customerRow = null;

  for (
    let i = 1;
    i < customerValues.length;
    i++
  ) {

    if (
      String(
        customerValues[i][
          customerColumns['Customer ID']
        ] || ''
      ).trim() === customerId
    ) {
      customerRow =
        customerValues[i];

      break;
    }
  }

  if (!customerRow) {
    throw new Error(
      'Customer record not found for ' +
      orderId +
      '.'
    );
  }

  const whatsappOptIn =
    String(
      customerRow[
        customerColumns[
          'WhatsApp Opt-In'
        ]
      ] || ''
    ).trim()
      .toUpperCase();

  if (whatsappOptIn !== 'Y') {
    console.log(
      'delivery_confirmation_5 skipped for ' +
      orderId +
      ': WhatsApp Opt-In is not Y.'
    );

    return {
      sent: false,
      skipped: true
    };
  }

  const customerName =
    String(
      orderRow[
        orderColumns['Customer Name']
      ] || ''
    ).trim() ||
    String(
      customerRow[
        customerColumns['Name']
      ] || ''
    ).trim();

  const rawPhone =
    String(
      orderRow[
        orderColumns['Phone']
      ] || ''
    ).trim() ||
    String(
      customerRow[
        customerColumns['Phone']
      ] || ''
    ).trim();

  const recipient =
    routePublishedNormalisePhone_(
      rawPhone
    );

  if (!/^614\d{8}$/.test(recipient)) {
    throw new Error(
      'Invalid Australian mobile number for ' +
      orderId +
      '.'
    );
  }

  const firstName =
    routePublishedFirstName_(
      customerName
    );

  if (!firstName) {
    throw new Error(
      'Customer name missing for ' +
      orderId +
      '.'
    );
  }

  const sendResult =
    sendDeliveryConfirmationTemplate_(
      recipient,
      firstName,
      orderId
    );

  const now =
    new Date();

  registerWhatsAppOutbound_(
    sendResult.messageId,
    orderId,
    'delivery_confirmation_5',
    recipient,
    now
  );

  console.log(
    'delivery_confirmation_5 sent for ' +
    orderId +
    ' | message ' +
    sendResult.messageId
  );

  return {
    sent: true,
    messageId:
      sendResult.messageId
  };
}


function sendDeliveryConfirmationTemplate_(
  recipient,
  firstName,
  orderId
) {

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: 'delivery_confirmation_5',
      language: {
        code: 'en_US'
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: firstName
            },
            {
              type: 'text',
              text: orderId
            }
          ]
        }
      ]
    }
  };

  const responseText =
    sendWhatsAppPayload_(
      payload
    );

  let responseJson = {};

  try {
    responseJson =
      JSON.parse(responseText);
  } catch (err) {
    throw new Error(
      'delivery_confirmation_5 was accepted, ' +
      'but the Meta response could not be parsed.'
    );
  }

  const messageId =
    responseJson &&
    responseJson.messages &&
    responseJson.messages[0] &&
    responseJson.messages[0].id
      ? String(
          responseJson.messages[0].id
        )
      : '';

  if (!messageId) {
    throw new Error(
      'delivery_confirmation_5 response did not contain a message ID.'
    );
  }

  return {
    messageId: messageId,
    rawResponse: responseJson
  };
}


function deliveryConfirmationAlreadyLogged_(
  orderId
) {

  const ss =
    SpreadsheetApp.openById(
      CONTROL_TOWER_SPREADSHEET_ID
    );

  const sheet =
    ss.getSheetByName(
      'WhatsApp Log'
    );

  if (!sheet) {
    throw new Error(
      'WhatsApp Log sheet was not found.'
    );
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const values =
    sheet
      .getRange(
        2,
        2,
        lastRow - 1,
        2
      )
      .getDisplayValues();

  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    const loggedOrderId =
      String(
        values[i][0] || ''
      ).trim();

    const messageType =
      String(
        values[i][1] || ''
      ).trim();

    if (
      loggedOrderId === orderId &&
      messageType ===
        'delivery_confirmation_5'
    ) {
      return true;
    }
  }

  return false;
}



function routificWebhookResponse_(
  statusCode,
  message
) {

  return ContentService
    .createTextOutput(
      JSON.stringify({
        status: statusCode,
        message: message
      })
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}
