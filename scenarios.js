// Wingman Pilot — sample conversations for the local simulator.
//
// Mirrors the eight scripts the deployed app serves (4 seller, 4 buyer). Client
// lines are written so they trip the corresponding rule in engine.js — that is
// what makes the detection loop demonstrable without a live microphone.
//
// speaker: 'agent' = the realtor, 'client' = the seller or buyer.
(function (root, factory) {
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.SCENARIOS = data;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  return [
    {
      index: 0,
      role: 'seller',
      label: 'Seller \u00b7 Commission pushback',
      lines: [
        { speaker: 'agent', text: 'Thanks for having me out. The place shows really well.' },
        { speaker: 'client', text: 'Sure, sure. So how does this whole thing work?' },
        { speaker: 'agent', text: 'Simple \u2014 I handle pricing, marketing, showings, and negotiation.' },
        { speaker: 'client', text: 'Right, and what is your commission?' },
        { speaker: 'client', text: 'Honestly, six percent feels high. I want to keep more of the sale in my pocket.' },
        { speaker: 'agent', text: 'Let me walk you through what that fee actually covers.' },
      ],
    },
    {
      index: 1,
      role: 'seller',
      label: 'Seller \u00b7 Already have an agent',
      lines: [
        { speaker: 'agent', text: 'I noticed your listing expired last month, so I wanted to introduce myself.' },
        { speaker: 'client', text: 'Oh, we have actually been talking with another agent.' },
        { speaker: 'client', text: 'We are already working with someone, so we are pretty set.' },
        { speaker: 'agent', text: 'Absolutely. Can I ask how that relationship is going?' },
      ],
    },
    {
      index: 2,
      role: 'seller',
      label: 'Seller \u00b7 Just testing the market',
      lines: [
        { speaker: 'agent', text: 'What is prompting the move right now?' },
        { speaker: 'client', text: 'To be honest, we are just testing the market.' },
        { speaker: 'client', text: 'We are not in a huge rush, and we might not actually sell.' },
        { speaker: 'agent', text: 'That is completely fine. Let me show you what the numbers look like.' },
      ],
    },
    {
      index: 3,
      role: 'seller',
      label: 'Seller \u00b7 Price / timing hesitation',
      lines: [
        { speaker: 'agent', text: 'Based on the comps, I would list around six forty.' },
        { speaker: 'client', text: 'Hmm, that is lower than we were expecting.' },
        { speaker: 'client', text: 'Maybe we should wait until the spring market picks up.' },
        { speaker: 'agent', text: 'Let me show you why waiting may cost you more than it gains.' },
      ],
    },
    {
      index: 4,
      role: 'buyer',
      label: 'Buyer \u00b7 Financing concerns',
      lines: [
        { speaker: 'agent', text: 'This one checks every box you gave me.' },
        { speaker: 'client', text: 'We are pre-approved, but only up to a certain number.' },
        { speaker: 'client', text: 'I am a little worried the mortgage payment would stretch us.' },
        { speaker: 'agent', text: 'Let us look at the actual monthly numbers together.' },
      ],
    },
    {
      index: 5,
      role: 'buyer',
      label: 'Buyer \u00b7 Inspection worries',
      lines: [
        { speaker: 'agent', text: 'The sellers have already had it inspected, if you want to see.' },
        { speaker: 'client', text: 'The roof is what worries me. It looked old.' },
        { speaker: 'client', text: 'What happens if the inspection turns up something big, like the foundation?' },
        { speaker: 'agent', text: 'Great question. There are protections in the contract for exactly that.' },
      ],
    },
    {
      index: 6,
      role: 'buyer',
      label: 'Buyer \u00b7 Wants to see more first',
      lines: [
        { speaker: 'agent', text: 'I think this is the one. Should we talk about an offer?' },
        { speaker: 'client', text: 'It is nice, but I would like to see a few more homes first.' },
        { speaker: 'client', text: 'I am not ready to commit to anything today.' },
        { speaker: 'agent', text: 'Fair enough. Let me line up three more this weekend.' },
      ],
    },
    {
      index: 7,
      role: 'buyer',
      label: 'Buyer \u00b7 Price too high',
      lines: [
        { speaker: 'agent', text: 'They are asking five fifty for it.' },
        { speaker: 'client', text: 'That is too high. Five twenty-five feels above what we wanted to spend.' },
        { speaker: 'client', text: 'It is honestly out of our budget.' },
        { speaker: 'agent', text: 'Let me pull the comps and see what the data says.' },
      ],
    },
  ];
});
