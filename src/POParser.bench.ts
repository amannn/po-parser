import {bench} from 'vitest';
import POParser from './POParser.js';

const samplePO = `
msgid ""
msgstr ""
"POT-Creation-Date: 2025-10-27 16:00+0000\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Language: en\\n"

#: src/components/Button.tsx:15
#. Button text for submit action
msgctxt "ui.button"
msgid "submit"
msgstr "Submit"

#: src/components/Greeting.tsx:10
msgid "hello"
msgstr "Hello World"

#: src/components/Farewell.tsx:5
msgid "goodbye"
msgstr "Goodbye"

#: src/components/Greeting.tsx:25
msgctxt "ui.greeting"
msgid "welcome"
msgstr "Welcome"
`;

const sampleCatalog = {
  meta: {
    'POT-Creation-Date': '2025-10-27 16:00+0000',
    'MIME-Version': '1.0',
    'Content-Type': 'text/plain; charset=UTF-8',
    Language: 'en'
  },
  messages: [
    {
      id: 'ui.button.submit',
      message: 'Submit',
      description: 'Button text for submit action',
      references: [{path: 'src/components/Button.tsx'}]
    },
    {
      id: 'hello',
      message: 'Hello World',
      references: [{path: 'src/components/Greeting.tsx'}]
    },
    {
      id: 'goodbye',
      message: 'Goodbye',
      references: [{path: 'src/components/Farewell.tsx'}]
    },
    {
      id: 'ui.greeting.welcome',
      message: 'Welcome',
      references: [{path: 'src/components/Greeting.tsx'}]
    }
  ]
};

bench('parse', () => {
  POParser.parse(samplePO);
});

bench('serialize', () => {
  POParser.serialize(sampleCatalog);
});

bench('round-trip', () => {
  const parsed = POParser.parse(samplePO);
  POParser.serialize(parsed);
});
