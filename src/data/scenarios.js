// Sample conversation scripts for the simulated live feed.
// speaker: 'agent' is the realtor (coached side), 'client' is the buyer/seller.
// These stand in for real microphone audio; each line is streamed in
// phrase-sized chunks by the server at natural pace.

const SCENARIOS = [
  {
    id: 'seller-commission',
    role: 'seller',
    label: 'Seller · Commission pushback',
    lines: [
      { speaker: 'agent', text: "So thanks for having me over — this is a great house, and I think it's going to show really well." },
      { speaker: 'client', text: "Thanks. We like it, we've put a lot into it over the years." },
      { speaker: 'agent', text: "Let me walk you through how I'd price it, the timeline, and exactly what my marketing plan looks like." },
      { speaker: 'client', text: "Before we get too far — what's your commission, and is that negotiable?" },
      { speaker: 'agent', text: "I charge six percent, and here's what that covers on the listing side." },
      { speaker: 'client', text: "Six percent feels like a lot. I was hoping to keep more of the sale in my pocket." },
    ],
  },
  {
    id: 'seller-existing-agent',
    role: 'seller',
    label: 'Seller · Already have an agent',
    lines: [
      { speaker: 'agent', text: "Congrats on deciding to sell — the market has been very good for homes in this area." },
      { speaker: 'client', text: "Thanks, we're excited but honestly a little nervous about the whole thing." },
      { speaker: 'agent', text: "Totally normal. I can take you through the process step by step." },
      { speaker: 'client', text: "I should be upfront — we've already been talking to another agent." },
    ],
  },
  {
    id: 'seller-testing-market',
    role: 'seller',
    label: 'Seller · Just testing the market',
    lines: [
      { speaker: 'agent', text: "What's driving the move, if you don't mind me asking?" },
      { speaker: 'client', text: "We're not in a huge rush. We just want to see what the place is worth right now." },
      { speaker: 'agent', text: "Got it. I can put together a full market analysis at no cost." },
      { speaker: 'client', text: "Honestly we're just testing the market — we might not actually sell this year." },
    ],
  },
  {
    id: 'seller-timing',
    role: 'seller',
    label: 'Seller · Price / timing hesitation',
    lines: [
      { speaker: 'agent', text: "Based on comparable homes, I'd recommend listing right around four fifty." },
      { speaker: 'client', text: "That's lower than we were expecting, to be honest." },
      { speaker: 'agent', text: "I hear you. Let me show you the comps behind that number." },
      { speaker: 'client', text: "If that's really the number, maybe we should wait until spring to sell." },
    ],
  },
  {
    id: 'buyer-financing',
    role: 'buyer',
    label: 'Buyer · Financing concerns',
    lines: [
      { speaker: 'agent', text: "This one checks a lot of your boxes — the kitchen, the yard, the school district." },
      { speaker: 'client', text: "We love it. It's exactly what we've been looking for." },
      { speaker: 'agent', text: "Have you talked with a lender yet, or should I connect you with someone?" },
      { speaker: 'client', text: "We haven't gotten pre-approved yet, and I'm a little worried about qualifying for this amount." },
    ],
  },
  {
    id: 'buyer-inspection',
    role: 'buyer',
    label: 'Buyer · Inspection worries',
    lines: [
      { speaker: 'agent', text: "The sellers disclosed a few age-related items — the roof and the water heater." },
      { speaker: 'client', text: "How old is the roof exactly?" },
      { speaker: 'agent', text: "It's original to the house, so about twenty years old now." },
      { speaker: 'client', text: "Twenty years makes me nervous. What if the inspection turns up something big?" },
    ],
  },
  {
    id: 'buyer-more-options',
    role: 'buyer',
    label: 'Buyer · Wants to see more first',
    lines: [
      { speaker: 'agent', text: "So what did you think of this one compared to the last two?" },
      { speaker: 'client', text: "This is our favorite so far, no question." },
      { speaker: 'agent', text: "It won't last long — homes like this are getting multiple offers in the first week." },
      { speaker: 'client', text: "We'd still like to see a few more properties before we commit to anything." },
    ],
  },
  {
    id: 'buyer-price',
    role: 'buyer',
    label: 'Buyer · Price too high',
    lines: [
      { speaker: 'agent', text: "It's listed at five twenty-five, and the sellers have already done some recent updates." },
      { speaker: 'client', text: "It's nice, but five twenty-five feels above what we wanted to spend." },
      { speaker: 'agent', text: "What range were you thinking? I can focus the search there." },
      { speaker: 'client', text: "Honestly, this price is just too high for us. We'd need to stretch way beyond our comfort zone." },
    ],
  },
];

module.exports = { SCENARIOS };
