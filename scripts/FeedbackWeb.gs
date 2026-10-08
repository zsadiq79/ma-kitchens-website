/*
 * Ma Kitchens - Website Feedback V2 backend
 *
 * Add this as a NEW Apps Script file named FeedbackWeb.gs in the existing
 * production WhatsApp / delivery / feedback Apps Script project.
 *
 * This file deliberately does NOT define doPost(). The existing Code.gs
 * remains the single project-level doPost entry point.
 */

const FEEDBACK_WEB_LINKS_SHEET = 'Feedback Links';
const FEEDBACK_WEB_LINK_TTL_DAYS = 30;
const FEEDBACK_WEB_BASE_URL = 'https://www.makitchens.com.au/feedback/';

function handleFeedbackWebApiRequest_(e, action) {
  const auth = feedbackWebAuthorise_(e);

  if (!auth.ok) {
    return jsonResponse_({
      ok: false,
      error: auth.error
    });
  }

  try {
    if (action === 'feedback_read') {
      return jsonResponse_({
        ok: true,
        feedback: feedbackWebRead_(auth.body)
      });
    }

    if (action === 'feedback_submit') {
      return jsonResponse_({
        ok: true,
        result: feedbackWebSubmit_(auth.body)
      });
    }

    return jsonResponse_({
      ok: false,
      error: 'UNKNOWN_ACTION'
    });
  } catch (err) {
    console.error(
      'Feedback Web API error: ' +
      (err.stack || err)
    );

    return jsonResponse_({
      ok: false,
      error: 'FEEDBACK_WEB_ERROR',
      message: String(err.message || err)
    });
  }
}

function feedbackWebAuthorise_(e) {
  const properties =
    PropertiesService.getScriptProperties();

  // Reuse the existing server-to-server secret already used by Vercel.
  const expectedSecret =
    properties.getProperty('FLOW_MENU_API_SECRET');

  if (!expectedSecret) {
    return {
      ok: false,
      error: 'SERVER_CONFIGURATION_ERROR'
    };
  }

  let body = {};

  try {
    body = JSON.parse(
      e &&
      e.postData &&
      e.postData.contents
        ? e.postData.contents
        : '{}'
    );
  } catch (err) {
    return {
      ok: false,
      error: 'INVALID_JSON'
    };
  }

  const suppliedSecret =
    String(body.secret || '');

  if (
    !suppliedSecret ||
    suppliedSecret !== expectedSecret
  ) {
    return {
      ok: false,
      error: 'UNAUTHORISED'
    };
  }

  return {
    ok: true,
    body: body
  };
}

function feedbackWebRead_(body) {
  const token = feedbackWebNormaliseToken_(
    body.token
  );

  if (!token) {
    throw new Error('Invalid feedback token.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const context =
      feedbackWebGetLinkContext_(token);

    const order =
      feedbackWebBuildOrder_(context.orderId);

    // This is intentionally the only write on page open.
    // It is an audit timestamp and does not alter operational order data.
    context.sheet
      .getRange(context.rowNumber, 7)
      .setValue(new Date());

    return {
      customerName: order.customerName,
      deliveryDate: order.deliveryDate,
      orderId: order.orderId,
      status: context.status === 'COMPLETED'
        ? 'COMPLETED'
        : 'OPEN',
      dishes: order.dishes
    };
  } finally {
    lock.releaseLock();
  }
}

function feedbackWebSubmit_(body) {
  const token = feedbackWebNormaliseToken_(
    body.token
  );

  if (!token) {
    throw new Error('Invalid feedback token.');
  }

  const submission =
    body.submission &&
    typeof body.submission === 'object'
      ? body.submission
      : null;

  if (!submission) {
    throw new Error(
      'Feedback submission is missing.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const context =
      feedbackWebGetLinkContext_(token);

    if (context.status === 'COMPLETED') {
      return {
        status: 'ALREADY_COMPLETED',
        orderId: context.orderId
      };
    }

    const order =
      feedbackWebBuildOrder_(context.orderId);

    const validated =
      feedbackWebValidateSubmission_(
        submission,
        order
      );

    const spreadsheet =
      SpreadsheetApp.openById(
        CONTROL_TOWER_SPREADSHEET_ID
      );

    const feedbackSheet =
      spreadsheet.getSheetByName('Feedback');

    const deliveriesSheet =
      spreadsheet.getSheetByName('Deliveries');

    if (!feedbackSheet) {
      throw new Error(
        'Feedback sheet not found.'
      );
    }

    if (!deliveriesSheet) {
      throw new Error(
        'Deliveries sheet not found.'
      );
    }

    feedbackWebEnsureFeedbackConsentColumns_(
      feedbackSheet
    );

    let nextNumber =
      feedbackWebNextFeedbackNumber_(
        feedbackSheet
      );

    const now = new Date();
    const source =
      'WEB:' +
      feedbackWebHashToken_(token)
        .slice(0, 12);

    const rows = [];

    validated.dishes.forEach(item => {
      const dish =
        order.dishes.find(
          value =>
            value.itemCode === item.itemCode
        );

      if (!dish) {
        throw new Error(
          'Dish no longer belongs to this order.'
        );
      }

      rows.push([
        feedbackWebFormatId_(nextNumber++),
        now,
        order.orderId,
        order.customerId,
        dish.cookId,
        dish.itemCode,
        item.skipped ? '' : item.rating,
        'N',
        'N',
        item.skipped
          ? "Didn't try this"
          : item.comment,
        !item.skipped && item.rating <= 3
          ? 'Open'
          : 'None',
        source,
        '',
        ''
      ]);
    });

    rows.push([
      feedbackWebFormatId_(nextNumber++),
      now,
      order.orderId,
      order.customerId,
      '',
      'DELIVERY',
      validated.deliveryRating,
      'N',
      'N',
      validated.overallComment,
      validated.deliveryRating <= 3
        ? 'Open'
        : 'None',
      source,
      validated.testimonialConsent
        ? 'Y'
        : 'N',
      validated.testimonialConsent
        ? now
        : ''
    ]);

    feedbackSheet
      .getRange(
        feedbackSheet.getLastRow() + 1,
        1,
        rows.length,
        14
      )
      .setValues(rows);

    feedbackWebMarkDeliveryCompleted_(
      deliveriesSheet,
      order.orderId,
      now
    );

    context.sheet
      .getRange(
        context.rowNumber,
        5,
        1,
        2
      )
      .setValues([[
        'COMPLETED',
        now
      ]]);

    return {
      status: 'COMPLETED',
      orderId: order.orderId
    };
  } finally {
    lock.releaseLock();
  }
}

function feedbackWebValidateSubmission_(
  submission,
  order
) {
  const submittedDishes =
    Array.isArray(submission.dishes)
      ? submission.dishes
      : [];

  if (
    submittedDishes.length !==
    order.dishes.length
  ) {
    throw new Error(
      'Please provide feedback for every dish.'
    );
  }

  const expectedCodes = {};
  order.dishes.forEach(dish => {
    expectedCodes[dish.itemCode] = true;
  });

  const seenCodes = {};
  const dishes = submittedDishes.map(item => {
    const itemCode =
      String(item.itemCode || '').trim();

    if (
      !expectedCodes[itemCode] ||
      seenCodes[itemCode]
    ) {
      throw new Error(
        'Feedback contains an invalid dish.'
      );
    }

    seenCodes[itemCode] = true;

    const skipped =
      item.skipped === true;

    const rating =
      Number(item.rating || 0);

    if (
      !skipped &&
      (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      )
    ) {
      throw new Error(
        'Dish ratings must be from 1 to 5.'
      );
    }

    const comment =
      String(item.comment || '')
        .trim()
        .slice(0, 600);

    return {
      itemCode: itemCode,
      skipped: skipped,
      rating: skipped ? 0 : rating,
      comment: comment
    };
  });

  const deliveryRating =
    Number(submission.deliveryRating || 0);

  if (
    !Number.isInteger(deliveryRating) ||
    deliveryRating < 1 ||
    deliveryRating > 5
  ) {
    throw new Error(
      'Delivery rating must be from 1 to 5.'
    );
  }

  const overallComment =
    String(submission.overallComment || '')
      .trim()
      .slice(0, 1200);

  return {
    dishes: dishes,
    deliveryRating: deliveryRating,
    overallComment: overallComment,
    testimonialConsent:
      submission.testimonialConsent === true
  };
}

function feedbackWebBuildOrder_(orderId) {
  const spreadsheet =
    SpreadsheetApp.openById(
      CONTROL_TOWER_SPREADSHEET_ID
    );

  const ordersSheet =
    spreadsheet.getSheetByName('Orders');

  const orderItemsSheet =
    spreadsheet.getSheetByName('Order Items');

  const dishesSheet =
    spreadsheet.getSheetByName('Dishes');

  const deliveriesSheet =
    spreadsheet.getSheetByName('Deliveries');

  if (
    !ordersSheet ||
    !orderItemsSheet ||
    !dishesSheet ||
    !deliveriesSheet
  ) {
    throw new Error(
      'One or more Control Tower sheets are missing.'
    );
  }

  const orderTable =
    feedbackWebReadTable_(ordersSheet);

  const orderRow =
    orderTable.rows.find(row =>
      String(
        row[orderTable.col['Order ID']] || ''
      ).trim() === orderId
    );

  if (!orderRow) {
    throw new Error('Order not found.');
  }

  if (
    String(
      orderRow[
        orderTable.col['Order Status']
      ] || ''
    ).trim() === 'Cancelled'
  ) {
    throw new Error(
      'Cancelled orders cannot receive feedback.'
    );
  }

  const deliveryTable =
    feedbackWebReadTable_(deliveriesSheet);

  const deliveryRow =
    deliveryTable.rows.find(row =>
      String(
        row[
          deliveryTable.col['Order ID']
        ] || ''
      ).trim() === orderId
    );

  if (
    !deliveryRow ||
    String(
      deliveryRow[
        deliveryTable.col[
          'Delivery Status'
        ]
      ] || ''
    ).trim() !== 'Delivered'
  ) {
    throw new Error(
      'Feedback is only available after delivery.'
    );
  }

  const dishTable =
    feedbackWebReadTable_(dishesSheet);

  const dishByCode = {};

  dishTable.rows.forEach(row => {
    const code =
      String(
        row[
          dishTable.col['Item Code']
        ] || ''
      ).trim();

    if (code) {
      dishByCode[code] = row;
    }
  });

  const itemTable =
    feedbackWebReadTable_(orderItemsSheet);

  const dishes = [];

  itemTable.rows.forEach(row => {
    const rowOrderId =
      String(
        row[
          itemTable.col['Order ID']
        ] || ''
      ).trim();

    const rowOrderStatus =
      String(
        row[
          itemTable.col['Order Status']
        ] || ''
      ).trim();

    const fulfilmentStatus =
      String(
        row[
          itemTable.col[
            'Fulfilment Status'
          ]
        ] || ''
      ).trim();

    if (
      rowOrderId !== orderId ||
      rowOrderStatus === 'Cancelled' ||
      fulfilmentStatus === 'Cancelled'
    ) {
      return;
    }

    const itemCode =
      String(
        row[
          itemTable.col[
            'Item Code (AUTO, INTERNAL)'
          ]
        ] || ''
      ).trim();

    if (!itemCode) {
      return;
    }

    // A customer rates a dish once per order even
    // when quantity is greater than one.
    if (
      dishes.some(
        dish => dish.itemCode === itemCode
      )
    ) {
      return;
    }

    const dishRow =
      dishByCode[itemCode];

    const dishName =
      dishRow
        ? String(
            dishRow[
              dishTable.col['Dish Name']
            ] || ''
          ).trim()
        : String(
            row[
              itemTable.col['Dish Name']
            ] || ''
          ).trim();

    dishes.push({
      itemCode: itemCode,
      cookId: dishRow
        ? String(
            dishRow[
              dishTable.col['Cook ID']
            ] || ''
          ).trim()
        : String(
            row[
              itemTable.col['Cook ID']
            ] || ''
          ).trim(),
      dishName: dishName,
      kitchenName: dishRow
        ? String(
            dishRow[
              dishTable.col[
                'Menu Kitchen Name'
              ]
            ] || ''
          ).trim()
        : '',
      imageUrl: dishRow
        ? String(
            dishRow[
              dishTable.col['Image URL']
            ] || ''
          ).trim()
        : ''
    });
  });

  if (!dishes.length) {
    throw new Error(
      'No feedback-eligible order items found.'
    );
  }

  const rawDeliveryDate =
    orderRow[
      orderTable.col['Delivery Date']
    ];

  const deliveryDate =
    rawDeliveryDate instanceof Date
      ? Utilities.formatDate(
          rawDeliveryDate,
          spreadsheet.getSpreadsheetTimeZone() ||
            'Australia/Sydney',
          'd MMMM yyyy'
        )
      : String(rawDeliveryDate || '');

  return {
    orderId: orderId,
    customerId: String(
      orderRow[
        orderTable.col['Customer ID']
      ] || ''
    ).trim(),
    customerName: String(
      orderRow[
        orderTable.col['Customer Name']
      ] || ''
    ).trim(),
    deliveryDate: deliveryDate,
    dishes: dishes
  };
}

function feedbackWebReadTable_(sheet) {
  const values =
    sheet.getDataRange().getValues();

  if (!values.length) {
    throw new Error(
      sheet.getName() + ' is empty.'
    );
  }

  const headers = values[0].map(value =>
    String(value).trim()
  );

  const col = {};

  headers.forEach((header, index) => {
    col[header] = index;
  });

  return {
    col: col,
    rows: values.slice(1)
  };
}

function feedbackWebGetLinkContext_(token) {
  const sheet =
    feedbackWebGetOrCreateLinksSheet_();

  const hash =
    feedbackWebHashToken_(token);

  const values =
    sheet.getDataRange().getValues();

  for (
    let index = 1;
    index < values.length;
    index++
  ) {
    if (
      String(values[index][0] || '') ===
      hash
    ) {
      const expiresAt =
        values[index][3];

      if (
        expiresAt instanceof Date &&
        expiresAt.getTime() <
          new Date().getTime()
      ) {
        throw new Error(
          'This feedback link has expired.'
        );
      }

      return {
        sheet: sheet,
        rowNumber: index + 1,
        orderId: String(
          values[index][1] || ''
        ).trim(),
        status: String(
          values[index][4] || 'OPEN'
        ).trim()
      };
    }
  }

  throw new Error(
    'Feedback link not found.'
  );
}

function getOrCreateFeedbackWebLink_(orderId) {
  const normalizedOrderId =
    String(orderId || '').trim();

  if (
    !/^ORD-\d+$/.test(
      normalizedOrderId
    )
  ) {
    throw new Error(
      'Invalid Order ID.'
    );
  }

  // Validate the order before creating a link.
  feedbackWebBuildOrder_(
    normalizedOrderId
  );

  const sheet =
    feedbackWebGetOrCreateLinksSheet_();

  const values =
    sheet.getDataRange().getValues();

  for (
    let index = 1;
    index < values.length;
    index++
  ) {
    const rowOrderId =
      String(values[index][1] || '')
        .trim();

    const status =
      String(values[index][4] || '')
        .trim();

    const expiresAt =
      values[index][3];

    if (
      rowOrderId === normalizedOrderId &&
      status !== 'COMPLETED' &&
      (
        !(expiresAt instanceof Date) ||
        expiresAt.getTime() >
          new Date().getTime()
      )
    ) {
      // Raw tokens are deliberately not stored,
      // so an existing token cannot be reconstructed.
      // Expire the old row and create a fresh one.
      sheet
        .getRange(index + 1, 5)
        .setValue('REPLACED');
    }
  }

  const rawToken =
    Utilities.getUuid()
      .replace(/-/g, '') +
    Utilities.getUuid()
      .replace(/-/g, '');

  const now = new Date();

  const expiresAt =
    new Date(
      now.getTime() +
      FEEDBACK_WEB_LINK_TTL_DAYS *
        24 *
        60 *
        60 *
        1000
    );

  sheet.appendRow([
    feedbackWebHashToken_(rawToken),
    normalizedOrderId,
    now,
    expiresAt,
    'OPEN',
    '',
    ''
  ]);

  return (
    FEEDBACK_WEB_BASE_URL +
    rawToken
  );
}

function createFeedbackWebLinkForOrder(
  orderId
) {
  const url =
    getOrCreateFeedbackWebLink_(
      orderId
    );

  console.log(url);
  return url;
}

function feedbackWebGetOrCreateLinksSheet_() {
  const spreadsheet =
    SpreadsheetApp.openById(
      CONTROL_TOWER_SPREADSHEET_ID
    );

  let sheet =
    spreadsheet.getSheetByName(
      FEEDBACK_WEB_LINKS_SHEET
    );

  if (!sheet) {
    sheet =
      spreadsheet.insertSheet(
        FEEDBACK_WEB_LINKS_SHEET
      );

    sheet.getRange(1, 1, 1, 7)
      .setValues([[
        'Token Hash',
        'Order ID',
        'Created At',
        'Expires At',
        'Status',
        'Submitted At',
        'Last Opened At'
      ]]);

    sheet.setFrozenRows(1);
  }

  return sheet;
}

function feedbackWebEnsureFeedbackConsentColumns_(
  sheet
) {
  const lastColumn =
    Math.max(sheet.getLastColumn(), 1);

  const headers =
    sheet
      .getRange(1, 1, 1, lastColumn)
      .getDisplayValues()[0]
      .map(value =>
        String(value).trim()
      );

  if (
    headers[12] !==
    'Marketing Consent'
  ) {
    sheet
      .getRange(1, 13)
      .setValue(
        'Marketing Consent'
      );
  }

  if (
    headers[13] !==
    'Marketing Consent At'
  ) {
    sheet
      .getRange(1, 14)
      .setValue(
        'Marketing Consent At'
      );
  }
}

function feedbackWebMarkDeliveryCompleted_(
  sheet,
  orderId,
  completedAt
) {
  const table =
    feedbackWebReadTable_(sheet);

  const rowIndex =
    table.rows.findIndex(row =>
      String(
        row[
          table.col['Order ID']
        ] || ''
      ).trim() === orderId
    );

  if (rowIndex < 0) {
    throw new Error(
      'Delivery record not found.'
    );
  }

  const actualRow = rowIndex + 2;

  // J = Feedback Status
  // M = Feedback Completed At
  sheet
    .getRange(actualRow, 10)
    .setValue('Completed');

  sheet
    .getRange(actualRow, 13)
    .setValue(completedAt);
}

function feedbackWebNextFeedbackNumber_(
  sheet
) {
  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return 1;
  }

  const ids =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();

  let maxNumber = 0;

  ids.forEach(value => {
    const match =
      String(value || '')
        .match(/^FB-(\d+)$/);

    if (match) {
      maxNumber =
        Math.max(
          maxNumber,
          Number(match[1])
        );
    }
  });

  return maxNumber + 1;
}

function feedbackWebFormatId_(number) {
  return (
    'FB-' +
    String(number).padStart(6, '0')
  );
}

function feedbackWebNormaliseToken_(value) {
  const token =
    String(value || '').trim();

  if (
    !/^[A-Za-z0-9_-]{32,200}$/
      .test(token)
  ) {
    return '';
  }

  return token;
}

function feedbackWebHashToken_(token) {
  const bytes =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      token,
      Utilities.Charset.UTF_8
    );

  return bytes
    .map(byte => {
      const value =
        byte < 0
          ? byte + 256
          : byte;

      return (
        '0' +
        value.toString(16)
      ).slice(-2);
    })
    .join('');
}
