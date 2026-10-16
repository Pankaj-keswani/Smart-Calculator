/**
 * Localization & Multilingual Support (i18n)
 *
 * Supports English (US), Indian English / Hinglish (en-IN), and Hindi (hi-IN).
 * Designed so additional languages can be added with a single dictionary entry.
 */

import { SupportedLanguage, VoiceInteractionState } from '../models/types';

export interface LocalizedStrings {
  appName: string;
  voiceMode: string;
  calculatorMode: string;
  micStateLabel: Record<VoiceInteractionState, string>;
  micStateSubLabel: Record<VoiceInteractionState, string>;
  voiceInputPlaceholder: string;
  contextActiveLabel: string;
  clearContext: string;
  historyTitle: string;
  historyEmpty: string;
  clearHistory: string;
  settingsTitle: string;
  copyResult: string;
  copiedToast: string;
  shareResult: string;
  speakAgain: string;
  quickExamplesTitle: string;
  quickExamples: string[];
}

export const TRANSLATIONS: Record<SupportedLanguage, LocalizedStrings> = {
  'en-US': {
    appName: 'VoiceCalc AI',
    voiceMode: 'Voice',
    calculatorMode: 'Keypad',
    micStateLabel: {
      idle: 'Tap to calculate',
      listening: 'Listening...',
      processing: 'Thinking...',
      speaking: 'Answering...',
    },
    micStateSubLabel: {
      idle: 'Speak naturally — e.g. "15% of 800" or "Convert 5 km to m"',
      listening: 'Speak your calculation now...',
      processing: 'Understanding mathematical intent...',
      speaking: 'Speaking result aloud...',
    },
    voiceInputPlaceholder: 'Or type a natural voice command...',
    contextActiveLabel: 'Context memory active',
    clearContext: 'Reset',
    historyTitle: 'Calculation History',
    historyEmpty: 'No calculations yet. Try speaking or using the keypad.',
    clearHistory: 'Clear All',
    settingsTitle: 'Settings & AI Configuration',
    copyResult: 'Copy',
    copiedToast: 'Copied',
    shareResult: 'Share',
    speakAgain: 'Speak',
    quickExamplesTitle: 'Try saying',
    quickExamples: [
      'What is 15 percent of 800?',
      '18 percent GST on 1000',
      '20 percent discount on 1500',
      'Convert 5 kilometers to meters',
      'Square root of 144',
      '2 raised to the power of 10',
      'Split 2500 between 5 people',
      'Convert 10 Mbps to MB per second',
    ],
  },
  'en-IN': {
    appName: 'VoiceCalc AI',
    voiceMode: 'Voice',
    calculatorMode: 'Keypad',
    micStateLabel: {
      idle: 'Tap to calculate',
      listening: 'Listening...',
      processing: 'Thinking...',
      speaking: 'Answering...',
    },
    micStateSubLabel: {
      idle: 'Try "18% GST on 2500" or "500 ko 5 se divide karo"',
      listening: 'Boliye, kya calculate karna hai...',
      processing: 'Understanding mathematical intent...',
      speaking: 'Speaking result aloud...',
    },
    voiceInputPlaceholder: 'Type in English or Hinglish...',
    contextActiveLabel: 'Context memory active',
    clearContext: 'Reset',
    historyTitle: 'Calculation History',
    historyEmpty: 'No calculations yet.',
    clearHistory: 'Clear All',
    settingsTitle: 'Settings & AI Configuration',
    copyResult: 'Copy',
    copiedToast: 'Copied',
    shareResult: 'Share',
    speakAgain: 'Speak',
    quickExamplesTitle: 'Try saying (English / Hinglish)',
    quickExamples: [
      '2 plus 2 kitna hota hai?',
      '25 percent of 800 calculate karo',
      '500 ko 5 se divide karo',
      '18 percent GST on 1000',
      '20 percent discount on 1500',
      'Convert 5 kilometers to meters',
      'I have 1000 and spend 275',
    ],
  },
  'hi-IN': {
    appName: 'VoiceCalc AI',
    voiceMode: 'वॉइस (Voice)',
    calculatorMode: 'कीपैड (Keypad)',
    micStateLabel: {
      idle: 'गणना के लिए बोलें',
      listening: 'सुन रहा हूँ...',
      processing: 'गणना हो रही है...',
      speaking: 'उत्तर बोला जा रहा है...',
    },
    micStateSubLabel: {
      idle: 'बोलकर गणना करें — जैसे "500 ko 5 se divide karo" या "15% of 800"',
      listening: 'बोलिए, क्या गणना करनी है...',
      processing: 'AI द्वारा गणितीय व्याख्या जारी है...',
      speaking: 'उत्तर आवाज़ में बोला जा रहा है...',
    },
    voiceInputPlaceholder: 'यहाँ लिखें या माइक दबाएं...',
    contextActiveLabel: 'पिछला उत्तर याद है',
    clearContext: 'रीसेट',
    historyTitle: 'गणना इतिहास (History)',
    historyEmpty: 'अभी तक कोई गणना नहीं हुई है।',
    clearHistory: 'सभी हटाएं',
    settingsTitle: 'सेटिंग्स और AI कॉन्फ़िगरेशन',
    copyResult: 'कॉपी',
    copiedToast: 'कॉपी हो गया',
    shareResult: 'शेयर',
    speakAgain: 'सुनें',
    quickExamplesTitle: 'उदाहरण ट्राई करें',
    quickExamples: [
      '2 plus 2 kitna hota hai?',
      '25 percent of 800 calculate karo',
      '500 ko 5 se divide karo',
      '18 percent GST on 1000',
      'Convert 5 kilometers to meters',
    ],
  },
  'es-ES': {
    appName: 'VoiceCalc AI',
    voiceMode: 'Voz',
    calculatorMode: 'Teclado',
    micStateLabel: {
      idle: 'Toca para calcular',
      listening: 'Escuchando...',
      processing: 'Pensando...',
      speaking: 'Respondiendo...',
    },
    micStateSubLabel: {
      idle: 'Habla de forma natural — ej. "15 por ciento de 800"',
      listening: 'Di tu cálculo ahora...',
      processing: 'Interpretando intención matemática...',
      speaking: 'Diciendo el resultado en voz alta...',
    },
    voiceInputPlaceholder: 'O escribe un comando por voz...',
    contextActiveLabel: 'Contexto activo',
    clearContext: 'Reiniciar',
    historyTitle: 'Historial de Cálculos',
    historyEmpty: 'Sin cálculos recientes.',
    clearHistory: 'Borrar Todo',
    settingsTitle: 'Ajustes y Configuración AI',
    copyResult: 'Copiar',
    copiedToast: 'Copiado',
    shareResult: 'Compartir',
    speakAgain: 'Escuchar',
    quickExamplesTitle: 'Prueba diciendo',
    quickExamples: [
      '¿Cuánto es 15 por ciento de 800?',
      'Suma 25 y 75',
      '100 menos 35',
      '12 por 8',
      '144 entre 12',
      'Convertir 5 kilometros a metros',
    ],
  },
  'fr-FR': {
    appName: 'VoiceCalc AI',
    voiceMode: 'Voix',
    calculatorMode: 'Clavier',
    micStateLabel: {
      idle: 'Appuyez pour calculer',
      listening: 'Écoute en cours...',
      processing: 'Réflexion...',
      speaking: 'Réponse en cours...',
    },
    micStateSubLabel: {
      idle: 'Parlez naturellement — ex. "15 pour cent de 800"',
      listening: 'Énoncez votre calcul...',
      processing: 'Compréhension mathématique...',
      speaking: 'Lecture vocale du résultat...',
    },
    voiceInputPlaceholder: 'Ou tapez une commande vocale...',
    contextActiveLabel: 'Mémoire active',
    clearContext: 'Effacer',
    historyTitle: 'Historique des Calculs',
    historyEmpty: 'Aucun calcul pour le moment.',
    clearHistory: 'Tout effacer',
    settingsTitle: 'Paramètres et Configuration IA',
    copyResult: 'Copier',
    copiedToast: 'Copié',
    shareResult: 'Partager',
    speakAgain: 'Écouter',
    quickExamplesTitle: 'Essayez de dire',
    quickExamples: [
      'Combien fait 15 pour cent de 800 ?',
      'Ajoute 25 et 75',
      '100 moins 35',
      '12 fois 8',
      'Convertir 5 kilomètres en mètres',
    ],
  },
  'de-DE': {
    appName: 'VoiceCalc AI',
    voiceMode: 'Sprache',
    calculatorMode: 'Tastatur',
    micStateLabel: {
      idle: 'Tippen zum Rechnen',
      listening: 'Zuhören...',
      processing: 'Verarbeiten...',
      speaking: 'Antworten...',
    },
    micStateSubLabel: {
      idle: 'Sprechen Sie natürlich — z.B. "15 Prozent von 800"',
      listening: 'Sprechen Sie Ihre Rechnung jetzt...',
      processing: 'Mathematische Absicht wird analysiert...',
      speaking: 'Ergebnis wird vorgelesen...',
    },
    voiceInputPlaceholder: 'Oder Befehl eingeben...',
    contextActiveLabel: 'Kontext aktiv',
    clearContext: 'Zurücksetzen',
    historyTitle: 'Berechnungsverlauf',
    historyEmpty: 'Noch keine Berechnungen.',
    clearHistory: 'Alles löschen',
    settingsTitle: 'Einstellungen & KI-Konfiguration',
    copyResult: 'Kopieren',
    copiedToast: 'Kopiert',
    shareResult: 'Teilen',
    speakAgain: 'Vorlesen',
    quickExamplesTitle: 'Beispiele zum Sprechen',
    quickExamples: [
      'Was ist 15 Prozent von 800?',
      'Addiere 25 und 75',
      '100 minus 35',
      '12 mal 8',
      'Rechne 5 Kilometer in Meter um',
    ],
  },
};

export function getStrings(lang: SupportedLanguage = 'en-US'): LocalizedStrings {
  return TRANSLATIONS[lang] || TRANSLATIONS['en-US'];
}

export function formatSpokenResult(
  formattedResult: string,
  lang: SupportedLanguage = 'en-US'
): string {
  switch (lang) {
    case 'hi-IN':
      return `उत्तर है ${formattedResult}।`;
    case 'en-IN':
      return `Answer hai ${formattedResult}.`;
    case 'es-ES':
      return `La respuesta es ${formattedResult}.`;
    case 'fr-FR':
      return `La réponse est ${formattedResult}.`;
    case 'de-DE':
      return `Das Ergebnis ist ${formattedResult}.`;
    case 'en-US':
    default:
      return `The answer is ${formattedResult}.`;
  }
}

export function getLocalizedErrorMessage(
  lang: SupportedLanguage = 'en-US'
): string {
  switch (lang) {
    case 'hi-IN':
      return 'मुझे यह गणना समझ नहीं आई। कृपया दोबारा बोलें।';
    case 'en-IN':
      return 'Yeh calculation samajh nahi aaya. Please try again.';
    case 'es-ES':
      return 'No pude entender ese cálculo. Por favor intenta de nuevo.';
    case 'fr-FR':
      return "Je n'ai pas compris ce calcul. Veuillez réessayer.";
    case 'de-DE':
      return 'Ich konnte diese Rechnung nicht verstehen. Bitte versuchen Sie es erneut.';
    default:
      return "I couldn't understand that calculation. Please try speaking again.";
  }
}
