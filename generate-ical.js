// generate-ical.js
import ical from 'ical-generator';
import fetch from 'node-fetch';
import fs from 'fs';

async function generateCalendar() {
    const calendar = ical({
        name: 'Tampa Events Calendar',
        description: 'Community events in Tampa'
    });

    try {
        const response = await fetch('https://www.tampa.gov/mobile-feeds/events');
        const events = await response.json();
        
        events.forEach(event => {
            const addressText = event.field_event_address
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            calendar.createEvent({
                start: new Date(event.startDate),
                end: new Date(event.endDate),
                summary: event.title,
                description: event.body.replace(/<[^>]*>/g, ''),
                location: addressText,
                url: event.alias || undefined
            });
        });

        if (!fs.existsSync('./dist')) {
            fs.mkdirSync('./dist');
        }
        
        fs.writeFileSync('./dist/calendar.ics', calendar.toString());
        fs.copyFileSync('./index.html', './dist/index.html');
        
    } catch (error) {
        console.error('Error generating calendar:', error);
        process.exit(1);
    }
}

generateCalendar();