/**



 * Ma Kitchens Menu V2



 * Standalone Apps Script web app.



 * Read-only against the MVP Control Tower.



 */







const MKV2_SPREADSHEET_ID = '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4';



const MKV2_WEEKLY_MENU_SHEET = 'Weekly Menu';



const MKV2_DISHES_SHEET = 'Dishes';



const MKV2_CONFIG_SHEET = 'Menu Config';



const MKV2_MAX_DESCRIPTION_CHARS = 80;







function doGet(e) {



  const cycleId = String(



    (e && e.parameter && e.parameter.cycle) || ''



  ).trim();







  const template = HtmlService.createTemplateFromFile('MenuV2');







  template.appUrl = ScriptApp.getService().getUrl();







  template.page = cycleId



    ? {



        mode: 'menu',



        menu: buildMenuV2_(cycleId)



      }



    : {



        mode: 'selector',



        cycles: listMenuCyclesV2_()



      };







  return template



    .evaluate()



    .setTitle('Ma Kitchens Menu V2')



    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)



    .addMetaTag(



      'viewport',



      'width=device-width, initial-scale=1'



    );



}







function listMenuCyclesV2_() {



  const ss = SpreadsheetApp.openById(MKV2_SPREADSHEET_ID);



  const sheet = ss.getSheetByName(MKV2_WEEKLY_MENU_SHEET);



  if (!sheet) throw new Error('Weekly Menu sheet not found.');







  const values = sheet.getDataRange().getValues();



  if (values.length < 2) return [];







  const col = headerMapV2_(values[0]);



  requireHeadersV2_(col, [



    'Menu Cycle ID',



    'Delivery Date',



    'Item Code',



    'Menu Status',



    'Menu Card Readiness'



  ], 'Weekly Menu');







  const timeZone = ss.getSpreadsheetTimeZone() || 'Australia/Sydney';



  const byCycle = {};







  values.slice(1).forEach(row => {



    const cycleId = textV2_(row[col['Menu Cycle ID']]);



    if (!cycleId) return;







    if (!byCycle[cycleId]) {



      byCycle[cycleId] = {



        menuCycleId: cycleId,



        deliveryDate: row[col['Delivery Date']],



        eligibleCount: 0



      };



    }







    const eligible =



      textV2_(row[col['Item Code']]) &&



      textV2_(row[col['Menu Status']]).toLowerCase() === 'available' &&



      textV2_(row[col['Menu Card Readiness']]).toUpperCase() === 'READY';







    if (eligible) byCycle[cycleId].eligibleCount += 1;



  });







  return Object.values(byCycle)



    .filter(c => c.eligibleCount > 0)



    .map(c => ({



      menuCycleId: c.menuCycleId,



      deliveryDateDisplay: formatDateV2_(c.deliveryDate, timeZone, 'EEE, d MMM yyyy'),



      eligibleCount: c.eligibleCount,



      sortValue: dateSortValueV2_(c.deliveryDate)



    }))



    .sort((a, b) => b.sortValue - a.sortValue);



}







function buildMenuV2_(cycleId) {



  const ss = SpreadsheetApp.openById(MKV2_SPREADSHEET_ID);



  const timeZone = ss.getSpreadsheetTimeZone() || 'Australia/Sydney';







  const weeklySheet = ss.getSheetByName(MKV2_WEEKLY_MENU_SHEET);



  const dishesSheet = ss.getSheetByName(MKV2_DISHES_SHEET);



  const configSheet = ss.getSheetByName(MKV2_CONFIG_SHEET);







  if (!weeklySheet) throw new Error('Weekly Menu sheet not found.');



  if (!dishesSheet) throw new Error('Dishes sheet not found.');



  if (!configSheet) throw new Error('Menu Config sheet not found.');







  const weeklyValues = weeklySheet.getDataRange().getValues();



  const weeklyDisplay = weeklySheet.getDataRange().getDisplayValues();



  const dishValues = dishesSheet.getDataRange().getValues();



  const configValues = configSheet.getDataRange().getValues();







  if (weeklyValues.length < 2) throw new Error('Weekly Menu has no data.');



  if (dishValues.length < 2) throw new Error('Dishes has no data.');







  const w = headerMapV2_(weeklyValues[0]);



  const d = headerMapV2_(dishValues[0]);







  requireHeadersV2_(w, [



    'Menu Cycle ID', 'Delivery Date', 'Item Code', 'Dish Name',



    'Menu Kitchen Name', 'Customer Price', 'Dietary Tags',



    'Menu Description', 'Image URL', 'Cook Section Order',



    'Dish Display Order', 'Menu Status', 'Menu Card Readiness'



  ], 'Weekly Menu');







  requireHeadersV2_(d, [



    'Item Code', 'Portion / Pack', 'Dish Category'



  ], 'Dishes');







  const dishByCode = {};



  dishValues.slice(1).forEach(row => {



    const code = textV2_(row[d['Item Code']]);



    if (!code) return;



    dishByCode[code] = {



      portion: textV2_(row[d['Portion / Pack']]),



      category: normalizeCategoryV2_(row[d['Dish Category']])



    };



  });







  const config = configMapV2_(configValues);



  const items = [];



  let deliveryDate = null;







  for (let i = 1; i < weeklyValues.length; i++) {



    const row = weeklyValues[i];



    const display = weeklyDisplay[i];







    if (textV2_(row[w['Menu Cycle ID']]) !== cycleId) continue;



    if (textV2_(row[w['Menu Status']]).toLowerCase() !== 'available') continue;



    if (textV2_(row[w['Menu Card Readiness']]).toUpperCase() !== 'READY') continue;







    const itemCode = textV2_(row[w['Item Code']]);



    if (!itemCode) continue;







    if (!deliveryDate) deliveryDate = row[w['Delivery Date']];







    const master = dishByCode[itemCode] || { portion: '', category: 'Main' };



    const priceDisplay = textV2_(display[w['Customer Price']]);







    items.push({



      itemCode,



      dishName: textV2_(row[w['Dish Name']]),



      kitchenName: textV2_(row[w['Menu Kitchen Name']]) || 'Kitchen',



      price: priceDisplay,



      portion: master.portion,



      dietaryTags: parseTagsV2_(row[w['Dietary Tags']]),



      description: textV2_(row[w['Menu Description']]),



      imageUrl: textV2_(row[w['Image URL']]),



      category: master.category,



      cookSectionOrder: numberV2_(row[w['Cook Section Order']], 9999),



      dishDisplayOrder: numberV2_(row[w['Dish Display Order']], 9999),

      sourceRowOrder: i



    });



  }







  if (!items.length) {



    throw new Error('No READY + Available dishes found for Menu Cycle ID: ' + cycleId);



  }







  const mains = items.filter(x => x.category !== 'Dessert');



  const desserts = items.filter(x => x.category === 'Dessert')



    .sort(compareDishOrderV2_);







  const kitchens = groupKitchensV2_(mains)

    .sort(compareKitchenPriorityV2_);



  const kitchenRows = packMainRowsV2_(kitchens);



  const deadline = calculateDeadlineV2_(deliveryDate, config, timeZone);







  return {



    branding: {



      brandName: config['Brand Name'] || 'Ma Kitchens',



      menuTitle: config['Menu Title'] || 'Weekly Menu',



      tagline: config['Tagline'] || 'Home cooked food by local cooks, delivered to you.'



    },



    cycle: {



      menuCycleId: cycleId,



      deliveryDateDisplay: formatDateV2_(deliveryDate, timeZone, 'EEEE, d MMMM yyyy'),



      orderDeadlineDisplay: deadline



    },



    commercial: {



      discount: numberV2_(config['Standard Discount %'], 0),



      minimumOrderItems: numberV2_(config['Minimum Order Items'], 0),



      deliveryFee: numberV2_(config['Delivery Fee'], 0),



      freeDeliveryThreshold: numberV2_(config['Free Delivery Threshold'], 0),



      freeDeliveryThresholdBasis: config['Free Delivery Threshold Basis'] || 'Pre-discount food value'



    },



    contact: {



      whatsappDisplay: config['WhatsApp Display Number'] || '',



      whatsappInternational: config['WhatsApp International Number'] || '',



      whatsappChannelLink: config['WhatsApp Channel Link'] || '',

      website: config['Website'] || ''



    },



    kitchenRows,



    desserts



  };



}







function groupKitchensV2_(items) {

  const map = {};

  items.forEach(item => {

    if (!map[item.kitchenName]) {

      map[item.kitchenName] = {

        name: item.kitchenName,

        cookSectionOrder: item.cookSectionOrder,

        firstSourceRowOrder: item.sourceRowOrder,

        dishes: []

      };

    }

    map[item.kitchenName].cookSectionOrder = Math.min(

      map[item.kitchenName].cookSectionOrder,

      item.cookSectionOrder

    );

    map[item.kitchenName].firstSourceRowOrder = Math.min(

      map[item.kitchenName].firstSourceRowOrder,

      item.sourceRowOrder

    );

    map[item.kitchenName].dishes.push(item);

  });

  return Object.values(map).map(k => {

    k.dishes.sort(compareDishOrderV2_);

    return k;

  });

}


function compareKitchenPriorityV2_(a, b) {

  // Manual kitchen priority is always the first rule.
  if (a.cookSectionOrder !== b.cookSectionOrder) {

    return a.cookSectionOrder - b.cookSectionOrder;

  }

  // If priorities are tied, larger kitchens go first.
  if (b.dishes.length !== a.dishes.length) {

    return b.dishes.length - a.dishes.length;

  }

  // Final tie-breaker: original Weekly Menu row order.
  return a.firstSourceRowOrder - b.firstSourceRowOrder;

}


function packMainRowsV2_(kitchens) {

  const rows = [];

  let current = {

    type: 'packed',

    segments: [],

    dishCount: 0

  };

  kitchens.forEach(kitchen => {

    let cursor = 0;

    while (cursor < kitchen.dishes.length) {

      const availableSlots = 4 - current.dishCount;

      const take = Math.min(

        availableSlots,

        kitchen.dishes.length - cursor

      );

      current.segments.push({

        name: kitchen.name,

        dishes: kitchen.dishes.slice(cursor, cursor + take)

      });

      current.dishCount += take;

      cursor += take;

      if (current.dishCount === 4) {

        rows.push(current);

        current = {

          type: 'packed',

          segments: [],

          dishCount: 0

        };

      }

    }

  });

  if (current.dishCount > 0) {

    rows.push(current);

  }

  return rows;

}


function compareDishOrderV2_(a, b) {

  if (a.dishDisplayOrder !== b.dishDisplayOrder) {

    return a.dishDisplayOrder - b.dishDisplayOrder;

  }

  return a.sourceRowOrder - b.sourceRowOrder;

}







function configMapV2_(values) {



  const map = {};



  values.slice(1).forEach(row => {



    const key = textV2_(row[0]);



    if (!key) return;



    map[key] = row[1];



  });



  return map;



}







function calculateDeadlineV2_(deliveryDate, config, timeZone) {



  if (!(deliveryDate instanceof Date) || isNaN(deliveryDate.getTime())) return '';







  const daysBefore = numberV2_(config['Default Deadline Days Before Delivery'], 2);



  const timeText = textV2_(config['Default Deadline Time']) || '20:00';



  const parts = timeText.split(':');



  const hour = Number(parts[0]);



  const minute = Number(parts[1] || 0);







  const deadline = new Date(deliveryDate.getTime());



  deadline.setDate(deadline.getDate() - daysBefore);



  deadline.setHours(isFinite(hour) ? hour : 20, isFinite(minute) ? minute : 0, 0, 0);







  return formatDateV2_(deadline, timeZone, "EEEE, d MMMM 'at' h:mm a");



}







function headerMapV2_(headerRow) {



  const map = {};



  headerRow.forEach((value, index) => {



    const header = textV2_(value);



    if (header) map[header] = index;



  });



  return map;



}







function requireHeadersV2_(map, names, sheetName) {



  names.forEach(name => {



    if (map[name] === undefined) {



      throw new Error('Missing ' + sheetName + ' column: ' + name);



    }



  });



}







function normalizeCategoryV2_(value) {



  return textV2_(value).toLowerCase() === 'dessert' ? 'Dessert' : 'Main';



}







function parseTagsV2_(value) {



  return textV2_(value)



    .split(',')



    .map(x => x.trim())



    .filter(Boolean);



}







function truncateV2_(value, maxChars) {



  const text = textV2_(value);



  if (text.length <= maxChars) return text;



  if (maxChars <= 1) return text.slice(0, maxChars);



  return text.slice(0, maxChars - 1).trimEnd() + '…';



}







function formatDateV2_(value, timeZone, pattern) {



  if (!(value instanceof Date) || isNaN(value.getTime())) return textV2_(value);



  return Utilities.formatDate(value, timeZone, pattern);



}







function dateSortValueV2_(value) {



  return value instanceof Date && !isNaN(value.getTime()) ? value.getTime() : 0;



}







function numberV2_(value, fallback) {



  const n = Number(value);



  return isFinite(n) ? n : fallback;



}







function textV2_(value) {



  return value === null || value === undefined ? '' : String(value).trim();



}







function renderDishCardV2_(dish, showKitchen) {



  const image = escapeHtmlV2_(dish.imageUrl);

  const name = escapeHtmlV2_(dish.dishName);

  const description = escapeHtmlV2_(dish.description);

  const price = escapeHtmlV2_(dish.price);

  const portion = escapeHtmlV2_(dish.portion);

  const kitchen = escapeHtmlV2_(dish.kitchenName);



  const dietaryText = (dish.dietaryTags || [])

    .map(tag => escapeHtmlV2_(tag))

    .filter(Boolean)

    .join(' · ');



  return [

    '<article class="dish-card">',

      image ? '<div class="dish-photo" role="img" aria-label="' + name + '" data-image-url="' + image + '" style="background-image:url(&quot;' + image + '&quot;)"></div>' : '<div class="dish-photo dish-photo-missing">No image</div>',

      '<div class="dish-body">',

        '<div class="dish-name">' + name + '</div>',

        '<div class="dish-description">' + description + '</div>',

        '<div class="dish-source' + (showKitchen ? '' : ' is-empty') + '">' + (showKitchen ? 'From ' + kitchen : '&nbsp;') + '</div>',

        '<div class="dish-meta">',

          '<div class="price-block">',

            '<span class="price">' + price + '</span>',

          '</div>',

          '<div class="meta-right">',

            portion ? '<div class="portion">' + portion + '</div>' : '<div class="portion is-empty">&nbsp;</div>',

            dietaryText ? '<div class="dietary">' + dietaryText + '</div>' : '<div class="dietary is-empty">&nbsp;</div>',

          '</div>',

        '</div>',

      '</div>',

    '</article>'

  ].join('');

}





function chunkV2_(items, size) {



  const result = [];



  for (let i = 0; i < items.length; i += size) {



    result.push(items.slice(i, i + size));



  }



  return result;



}







function escapeHtmlV2_(value) {



  return textV2_(value)



    .replace(/&/g, '&amp;')



    .replace(/</g, '&lt;')



    .replace(/>/g, '&gt;')



    .replace(/"/g, '&quot;')



    .replace(/'/g, '&#39;');



}



function testListMenuCyclesV2() {



  const cycles = listMenuCyclesV2_();



  Logger.log(JSON.stringify(cycles, null, 2));



}