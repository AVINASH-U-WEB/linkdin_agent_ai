import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('agents.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_guide = '''# =============================================================================
#  ENGLISH FOUNDER VOICE -- 5-ZONE STYLE GUIDE
# =============================================================================
STYLE_GUIDE = """
WRITING STYLE - ENGLISH FOUNDER VOICE (Clear, Effective, Universal)

LANGUAGE: 100% Clear English. No Tamil. No Taglish.
Anyone - a developer, a business owner, a student, a CEO - must immediately understand and connect with this post.

VOICE: Authentic, conversational founder. NOT corporate. NOT formal.
Write like you are talking directly to one person. Be real. Be vulnerable. Be bold.

FORMATTING RULES (MANDATORY):
- Short punchy lines. MAXIMUM 10 words per line.
- Blank lines between every distinct thought or zone.
- ONLY use this bullet format: -> (never -, *, or numbers)
- 3 to 5 emojis per post maximum.
- NO long paragraphs. Every sentence is its own line.

5-ZONE STRUCTURE (follow EXACTLY):
ZONE 1 - HOOK (3-5 lines): Bold shocking opener. Question or painful truth.
ZONE 2 - TENSION (5-8 lines): Contrast. Hard reality vs common belief. Use -> bullets.
ZONE 3 - DATA (5-8 lines): Real stats from research. Back up your point with -> bullets.
ZONE 4 - VISION (10-15 lines): Forward-looking message. Specific, vulnerable, inspiring.
ZONE 5 - CTA (5-8 lines): Simple direct call to action. One-word comment invite.

LENGTH REQUIREMENT: MINIMUM 40 to 50 lines. DO NOT write short posts.

PERFECT EXAMPLE POST (Model this EXACTLY):
Everyone told me to get a safe job after college.
I said no.
Here is what happened instead.

I did not quit because I was confused.
I quit because I was building something.

While everyone else chose comfort,
I chose...
-> Risk
-> Uncertainty
-> Zero bank balance (some months)
-> And a lot of "what are you even doing?" moments

Was it easy? No.
Was it worth it? Ask me in 5 years.

But here is what I know right now:

Every big company you admire once had 0 users.
Every founder you follow once had 0 followers.
The only difference?

They started.

Let me introduce what we are building:
[Company Name] - a community-first platform for developers and small businesses.
Not just a product.
A movement.

Where:
-> Developers grow from zero to hireable
-> Small businesses scale without burning cash
-> People learn by building, not just watching

Here is the honest truth about our team right now:
-> 2 founders
-> 1 big idea
-> 0 guarantees

And we would not have it any other way.

The people who told me to get a job?
They still have their job.
I have a company.

We are growing.
And we are looking for people who want to grow with us.

If you have the skills and hunger to build:
-> Comment Interested below
-> Or DM me directly

We will get back to everyone.
This is just the beginning.

If this resonated, share it with someone who needs to hear it.
Like if you agree.
Comment if you disagree - I read every response.

Let us build something that matters.
Let us grow. Together.
"""'''

# We know the block runs from idx=3887 (start of comment) to sg_end=6455
idx = 3887
sg_end = 6455

content = content[:idx] + new_guide + content[sg_end:]

with open('agents.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: STYLE_GUIDE replaced with English Founder Voice!")
