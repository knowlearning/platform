# Relational Data

If you know JavaScript and have mastered the ```async``` and ```await``` keywords, then the previous sections of this guide have probably been pretty smooth.
But now it is time to bring in another tool.
The tool we're bringing in is one of the most battle tested ones out there.
This tool has stood the test of time for the past 50 years as a useful component for almost every type of multi-user application imaginable.
Luckily, the learning curve to get started doesn't have to be too steep.
The tool we're talking about is the relational database.

## Before You Begin

If you are not already a relational database guru, you're in luck.
The way the Know Learning API uses relational databases lets you use the benefits of them, and frees you from the stress of managing them and the worry of losing data.

We could get pretty far building applications with just the JavaScript API we've already covered;
but, if our application has data that refers to other data, or we want to filter data to present exactly what a user should see, JavaScript alone (and, for that matter, almost every programming language) starts to be a lot less convenient to use.

Don't worry, no need to mess with relational databases when starting you application.
We promised a playful sandbox to start from, and we intend to keep that promise forever.
We also promised that you could grow that sandbox into a high quality, globally deployed application.
Layering a relational database onto your application is probably going to be a well advised part of that growth.

## Setting Up the "Mirror"

There is no new JavaScript API to learn to start using relational data in your application.
You just need to inform the KnowLearning API what parts of states you want to mirror into a relational database.

The term "mirror" sums up our simple approach to layering the power of a relational database onto your applciations.
We make it easy to set up a database as a simple mirror of the data that you are already comfortable managing in JSON state objects.
