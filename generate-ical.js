// generate-ical.js
import ical from 'ical-generator';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import he from 'he';

async function fetchEventTypes() {
    try {
        const response = await fetch('https://www.tampa.gov/taxonomy/terms/calendar_type');
        if (!response.ok) {
            throw new Error(`Failed to fetch event types: ${response.statusText}`);
        }
        const eventTypes = await response.json();

        // Inject the "all" ID
        eventTypes.push({
            name: "All Events",
            vid: "calendar_type",
            tid: "all"
        });

        return eventTypes;
    } catch (error) {
        console.error('Error fetching event types:', error);
        return [];
    }
}

async function fetchEventsForType(typeId) {
    // example format: https://www.tampa.gov/mobile-feeds/events/1
    // {
    //     nid: "153101",
    //     title: "Art in the Park: Paper Making ",
    //     body: "<p>Calling all fans of Florida Flora! Make your own recycled paper using natural materials found on our semitropical ground in this 2-day workshop that spans two weeks. Supplies included. Adults 18+</p>",
    //     field_event_collection: "Neighborhood Events",
    //     field_event_collection_1: "146",
    //     field_event_attachments: "/sites/default/files/webform/neighborhood_calendar_public_eve/137081/paper-making.png",
    //     field_event_address: "<p class="address" translate="no"><span class="address-line1">Cypress Point Park 5620 W Cypress St Tampa, FL 33607 </span><br>
    //     <span class="locality">Tampa</span>, <span class="administrative-area">FL</span> <span class="postal-code">33607</span><br>
    //     <span class="country">United States</span></p>",
    //     alias: "",
    //     endDate: "2024-11-02T13:00:00",
    //     startDate: "2024-11-02T10:00:00"
    //     },
    const response = await fetch(`https://www.tampa.gov/mobile-feeds/events/${typeId}`);
    return await response.json();
}

async function generateCalendarForType(eventType) {
    // Updated: changed from ical.createCalendar to direct function call
    const calendar = ical({
        name: `Tampa Calendar - ${eventType.name}`,
        description: `Community events in Tampa for ${eventType.name}`
    });

    try {
        const events = await fetchEventsForType(eventType.tid);

        events.forEach(event => {
            const sanitizeText = (text) => {
                return text.replace(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/g, '$2 ($1)') // Replace <a> tags with text (link)
                           .replace(/<[^>]*>/g, ' ')  // Remove other HTML tags
                           .replace(/&[a-z]+;/g, '\n') // Keep newline characters for HTML entities
                           .replace(/'/g, "")      // remove single quotes
                           .replace(/;/g, '\\;')    // Escape semicolons
                           .replace(/\s+/g, ' ')      // Replace multiple spaces with a single space
                           .replace(/[^a-zA-Z0-9 .,!?()\-_:;\\]/g, '') // Allow only specific characters
                           .trim();
            };
            const addressText = event.field_event_address
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

                const permalink = `https://www.tampa.gov/node/${event.nid}`;
                const description = `${sanitizeText(event.body)} \n\nPermalink: ${permalink}`;
                const sanitizedTitle = sanitizeText(event.title);

                calendar.createEvent({
                    start: moment.tz(event.startDate, 'America/New_York').utc().toDate(),
                    end: moment.tz(event.endDate, 'America/New_York').utc().toDate(),
                    summary: he.decode(sanitizedTitle),
                    description: description,
                    location: addressText,
                    url: event.alias ? `https://www.tampa.gov${event.alias}` : permalink
                });
        });

         // if tid = all then save file as calendar.ics else save file as tid.ics
         if (eventType.tid === 'all') {
            eventType.tid = 'calendar';
        }

        // Write directly to root instead of ./dist
        fs.writeFileSync(`./${eventType.tid}.ics`, calendar.toString());

    } catch (error) {
        console.error(`Error generating calendar for type ${eventType.name}:`, error);
    }
}

async function generateAllCalendars() {
    try {
        const eventTypes = await fetchEventTypes();

        for (const eventType of eventTypes) {
            await generateCalendarForType(eventType);
        }

        injectCalendarButtons(eventTypes);

    } catch (error) {
        console.error('Error generating calendars:', error);
        process.exit(1);
    }
}

function injectCalendarButtons(eventTypes) {
    // Change this from './dist' to '.'
    const distDir = '.';
    const files = fs.readdirSync(distDir);
    const eventTypeMap = new Map(eventTypes.map(eventType => [eventType.tid, eventType.name]));

    // Separate the "All/calendar" calendar file
    const allFile = files.find(file => path.basename(file, '.ics') === 'calendar');
    const otherFiles = files.filter(file => path.basename(file, '.ics') !== 'calendar').sort();

    // Combine "All/calendar" file with sorted other files
    const sortedFiles = allFile ? [allFile, ...otherFiles] : otherFiles;

    const buttonsHtml = sortedFiles
    .filter(file => file.endsWith('.ics'))
    .map(file => {
        const fileId = path.basename(file, '.ics');
        const eventName = eventTypeMap.get(fileId) || fileId;
        return `
            <li>
                <a href="webcal://miklb.github.io/tampa-events-ical/${file}" class="button">Subscribe to ${eventName} Calendar</a>
                <a href="https://miklb.github.io/tampa-events-ical/${file}" download class="button" aria-label="Download ${eventName} Calendar" title="Download ${eventName} Calendar" role="button">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="width: 1em; height: 1em; vertical-align: middle; fill: currentColor;">
                        <path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 242.7-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7 288 32zM64 352c-35.3 0-64 28.7-64 64l0 32c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-32c0-35.3-28.7-64-64-64l-101.5 0-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352 64 352zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/>
                    </svg>
                </a>
            </li>`;
    })
    .join('\n');

    const indexPath = './index.html';
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    indexHtml = indexHtml.replace('<!-- CALENDAR_BUTTONS_PLACEHOLDER -->', `<ul>${buttonsHtml}</ul>`);
    fs.writeFileSync(indexPath, indexHtml);
}

generateAllCalendars();