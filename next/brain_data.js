window.BRAIN_DATA = {
 "nodes": [
  {
   "id": "brain",
   "label": "Second Brain",
   "type": "router"
  },
  {
   "id": "assistant",
   "label": "V.E.R.A. (this system)",
   "type": "project"
  },
  {
   "id": "acme",
   "label": "Acme Consulting",
   "type": "business"
  },
  {
   "id": "website",
   "label": "Website Redesign",
   "type": "project"
  },
  {
   "id": "leads",
   "label": "Leads Ledger",
   "type": "business"
  },
  {
   "id": "crm",
   "label": "CRM Comparison",
   "type": "tool"
  },
  {
   "id": "research",
   "label": "research",
   "type": "ability"
  },
  {
   "id": "scheduler",
   "label": "scheduler",
   "type": "ability"
  },
  {
   "id": "watch",
   "label": "screen-watch",
   "type": "ability"
  },
  {
   "id": "mobile",
   "label": "Mobile App MVP",
   "type": "project"
  },
  {
   "id": "q3",
   "label": "Q3 Goals",
   "type": "business"
  },
  {
   "id": "meeting",
   "label": "Meeting Notes 07-24",
   "type": "note"
  },
  {
   "id": "podcast",
   "label": "Podcast Concept",
   "type": "idea"
  },
  {
   "id": "news",
   "label": "Weekly Newsletter",
   "type": "idea"
  },
  {
   "id": "lisbon",
   "label": "Lisbon Trip Plan",
   "type": "note"
  },
  {
   "id": "reading",
   "label": "Reading List",
   "type": "note"
  }
 ],
 "edges": [
  {
   "a": "assistant",
   "b": "brain"
  },
  {
   "a": "acme",
   "b": "brain"
  },
  {
   "a": "website",
   "b": "acme"
  },
  {
   "a": "website",
   "b": "brain"
  },
  {
   "a": "leads",
   "b": "acme"
  },
  {
   "a": "crm",
   "b": "acme"
  },
  {
   "a": "crm",
   "b": "leads"
  },
  {
   "a": "research",
   "b": "assistant"
  },
  {
   "a": "scheduler",
   "b": "assistant"
  },
  {
   "a": "watch",
   "b": "assistant"
  },
  {
   "a": "mobile",
   "b": "brain"
  },
  {
   "a": "mobile",
   "b": "acme"
  },
  {
   "a": "q3",
   "b": "acme"
  },
  {
   "a": "q3",
   "b": "leads"
  },
  {
   "a": "q3",
   "b": "mobile"
  },
  {
   "a": "meeting",
   "b": "website"
  },
  {
   "a": "meeting",
   "b": "acme"
  },
  {
   "a": "podcast",
   "b": "brain"
  },
  {
   "a": "news",
   "b": "podcast"
  },
  {
   "a": "news",
   "b": "leads"
  },
  {
   "a": "lisbon",
   "b": "brain"
  },
  {
   "a": "reading",
   "b": "brain"
  },
  {
   "a": "reading",
   "b": "podcast"
  }
 ]
};
