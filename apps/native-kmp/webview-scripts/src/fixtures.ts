/**
 * Test fixtures for ao3-parser tests
 * Based on real AO3 work: https://archiveofourown.org/works/10828137/chapters/24029673
 * "XCOM: The Advent Directive" by Xabiar
 */

// Sample AO3 work page HTML fixture based on real work structure
export const workPageHtml = `
<html lang="en">
    <head>
        <meta charset="utf-8">
        <meta http-equiv="x-ua-compatible" content="ie=edge">
        <meta
            name="keywords"
            content="fanfiction, transformative works, otw, fair use, archive"
        >
        <meta name="language" content="en-US">
        <meta name="subject" content="fandom">
        <meta
            name="description"
            content="An Archive of Our Own, a project of the Organization for Transformative Works"
        >
        <meta name="distribution" content="GLOBAL">
        <meta name="classification" content="transformative works">
        <meta name="author" content="Organization for Transformative Works">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="chrome" content="nointentdetection">
        <meta name="format-detection" content="telephone=no">
        <title>
            XCOM: The Advent Directive - Chapter 1 - Xabiar - XCOM: Enemy Within
            [Archive of Our Own]
        </title>
    </head>

    <body class="logged-out javascript" style="zoom: 1;">
        <div id="outer" class="wrapper">
            <ul id="skiplinks">
                <li>
                    <a href="#main">Main Content</a>
                </li>
            </ul>
            <noscript>
                <p id="javascript-warning">
                    While we&#39;ve done our best to make the core functionality
                    of this site accessible without JavaScript, it will work
                    better with it enabled. Please consider turning it on!
                </p>
            </noscript>

            <!-- BEGIN header -->

            <header id="header" class="region">
                <h1 class="heading">
                    <a href="/"
                        ><span>Archive of Our Own</span>
                        <sup>beta</sup>
                        <img
                            alt="Archive of Our Own"
                            class="logo"
                            src="/images/ao3_logos/logo_42.png"
                        ></a
                    >
                </h1>

                <div id="login" class="dropdown" aria-haspopup="true">
                    <p class="user actions">
                        <a
                            id="login-dropdown"
                            href="/users/login?return_to=%2Fworks%2F10828137%2Fchapters%2F24029673%3F%26view_adult%3Dtrue"
                            class="dropdown-toggle"
                            data-toggle="dropdown"
                            data-target="#"
                            >Log In</a
                        >
                    </p>
                    <div id="small_login" class="simple login">
                        <form
                            class="new_user"
                            id="new_user_session_small"
                            action="/users/login?return_to=%2Fworks%2F10828137%2Fchapters%2F24029673%3F%26view_adult%3Dtrue"
                            accept-charset="UTF-8"
                            method="post"
                        >
                            <input
                                type="hidden"
                                name="authenticity_token"
                                value="AFNCNCrIUW4Q1gUEdpemB_IR9rFbMkuGfZlW30bO4r2MfGS9Pk8lLkkdyKk4sF083LmUtrrOPt6rbYSYs1vbXQ"
                                autocomplete="off"
                            >
                            <dl>
                                <dt>
                                    <label for="user_session_login_small">
                                        Username or email:
                                    </label>
                                </dt>
                                <dd>
                                    <input
                                        autocomplete="on"
                                        id="user_session_login_small"
                                        type="text"
                                        name="user[login]"
                                    >
                                </dd>
                                <dt>
                                    <label for="user_session_password_small">
                                        Password:
                                    </label>
                                </dt>
                                <dd>
                                    <input
                                        id="user_session_password_small"
                                        type="password"
                                        name="user[password]"
                                    >
                                </dd>
                            </dl>
                            <p class="submit actions">
                                <label
                                    for="user_remember_me_small"
                                    class="action"
                                >
                                    <input
                                        type="checkbox"
                                        name="user[remember_me]"
                                        id="user_remember_me_small"
                                        value="1"
                                    >
                                    Remember Me
                                </label>
                                <input
                                    type="submit"
                                    name="commit"
                                    value="Log In"
                                >
                            </p>
                        </form>
                        <ul class="footnote actions">
                            <li>
                                <a href="/users/password/new"
                                    >Forgot password?</a
                                >
                            </li>
                            <li>
                                <a href="/invite_requests">Get an Invitation</a>
                            </li>
                        </ul>
                    </div>
                </div>

                <nav aria-label="Site">
                    <ul class="primary navigation actions">
                        <li class="dropdown" aria-haspopup="true">
                            <a
                                href="/menu/fandoms"
                                class="dropdown-toggle"
                                data-toggle="dropdown"
                                data-target="#"
                                >Fandoms</a
                            >
                            <ul class="menu dropdown-menu">
                                <li>
                                    <a href="/media">All Fandoms</a>
                                </li>
                                <li id="medium_5">
                                    <a href="/media/Anime%20*a*%20Manga/fandoms"
                                        >Anime &amp; Manga</a
                                    >
                                </li>
                                <li id="medium_3">
                                    <a
                                        href="/media/Books%20*a*%20Literature/fandoms"
                                        >Books &amp; Literature</a
                                    >
                                </li>
                                <li id="medium_4">
                                    <a
                                        href="/media/Cartoons%20*a*%20Comics%20*a*%20Graphic%20Novels/fandoms"
                                        >Cartoons &amp; Comics &amp; Graphic
                                        Novels</a
                                    >
                                </li>
                                <li id="medium_7">
                                    <a
                                        href="/media/Celebrities%20*a*%20Real%20People/fandoms"
                                        >Celebrities &amp; Real People</a
                                    >
                                </li>
                                <li id="medium_2">
                                    <a href="/media/Movies/fandoms">Movies</a>
                                </li>
                                <li id="medium_6">
                                    <a href="/media/Music%20*a*%20Bands/fandoms"
                                        >Music &amp; Bands</a
                                    >
                                </li>
                                <li id="medium_8">
                                    <a href="/media/Other%20Media/fandoms"
                                        >Other Media</a
                                    >
                                </li>
                                <li id="medium_30198">
                                    <a href="/media/Theater/fandoms">Theater</a>
                                </li>
                                <li id="medium_1">
                                    <a href="/media/TV%20Shows/fandoms"
                                        >TV Shows</a
                                    >
                                </li>
                                <li id="medium_476">
                                    <a href="/media/Video%20Games/fandoms"
                                        >Video Games</a
                                    >
                                </li>
                                <li id="medium_9971">
                                    <a
                                        href="/media/Uncategorized%20Fandoms/fandoms"
                                        >Uncategorized Fandoms</a
                                    >
                                </li>
                            </ul>
                        </li>
                        <li class="dropdown" aria-haspopup="true">
                            <a
                                href="/menu/browse"
                                class="dropdown-toggle"
                                data-toggle="dropdown"
                                data-target="#"
                                >Browse</a
                            >
                            <ul class="menu dropdown-menu">
                                <li>
                                    <a href="/works">Works</a>
                                </li>
                                <li>
                                    <a href="/bookmarks">Bookmarks</a>
                                </li>
                                <li>
                                    <a href="/tags">Tags</a>
                                </li>
                                <li>
                                    <a href="/collections">Collections</a>
                                </li>
                            </ul>
                        </li>
                        <li class="dropdown" aria-haspopup="true">
                            <a
                                href="/menu/search"
                                class="dropdown-toggle"
                                data-toggle="dropdown"
                                data-target="#"
                                >Search</a
                            >
                            <ul class="menu dropdown-menu">
                                <li>
                                    <a href="/works/search">Works</a>
                                </li>
                                <li>
                                    <a href="/bookmarks/search">Bookmarks</a>
                                </li>
                                <li>
                                    <a href="/tags/search">Tags</a>
                                </li>
                                <li>
                                    <a href="/people/search">People</a>
                                </li>
                            </ul>
                        </li>
                        <li class="dropdown" aria-haspopup="true">
                            <a
                                href="/menu/about"
                                class="dropdown-toggle"
                                data-toggle="dropdown"
                                data-target="#"
                                >About</a
                            >
                            <ul class="menu dropdown-menu">
                                <li>
                                    <a href="/about">About Us</a>
                                </li>
                                <li>
                                    <a href="/admin_posts">News</a>
                                </li>
                                <li>
                                    <a href="/faq">FAQ</a>
                                </li>
                                <li>
                                    <a href="/wrangling_guidelines"
                                        >Wrangling Guidelines</a
                                    >
                                </li>
                                <li>
                                    <a href="/donate">Donate or Volunteer</a>
                                </li>
                            </ul>
                        </li>
                        <li class="search">
                            <form
                                class="search"
                                id="search"
                                role="search"
                                aria-label="Work"
                                action="/works/search"
                                accept-charset="UTF-8"
                                method="get"
                            >
                                <fieldset>
                                    <p>
                                        <label
                                            class="landmark"
                                            for="site_search"
                                        >
                                            Work Search
                                        </label>
                                        <input
                                            class="text"
                                            id="site_search"
                                            aria-describedby="site_search_tooltip"
                                            type="text"
                                            name="work_search[query]"
                                        >
                                        <span
                                            class="tip"
                                            role="tooltip"
                                            id="site_search_tooltip"
                                            >tip: "sherlock (tv)" m/m NOT
                                            "sherlock holmes/john watson"</span
                                        >
                                        <span class="submit actions"
                                            ><input
                                                type="submit"
                                                value="Search"
                                                class="button"
                                            ></span
                                        >
                                    </p>
                                </fieldset>
                            </form>
                        </li>
                    </ul>
                </nav>

                <div class="clear"></div>
            </header>

            <!-- END header -->

            <div id="inner" class="wrapper">
                <!-- BEGIN sidebar -->
                <!-- END sidebar -->

                <!-- BEGIN main -->
                <div id="main" class="chapters-show region" role="main">
                    <div class="flash"></div>
                    <!--page description, messages-->
                    <!--/descriptions-->

                    <!--subnav-->
                    <!--/subnav-->

                    <!-- BEGIN work -->
                    <div class="work">
                        <p class="landmark">
                            <a name="top">&nbsp;</a>
                        </p>
                        <!-- BEGIN navigation -->
                        <h3 class="landmark heading">Actions</h3>
                        <ul class="work navigation actions">
                            <li class="chapter entire">
                                <a href="/works/10828137?view_full_work=true"
                                    >Entire Work</a
                                >
                            </li>

                            <li class="chapter next">
                                <a
                                    href="/works/10828137/chapters/24029694#workskin"
                                    >Next Chapter →</a
                                >
                            </li>

                            <li class="chapter">
                                <noscript>
                                    <a href="/works/10828137/navigate"
                                        >Chapter Index</a
                                    >
                                </noscript>
                                <button class="collapsed">Chapter Index</button>
                                <ul
                                    id="chapter_index"
                                    class="expandable secondary hidden"
                                >
                                    <li>
                                        <form
                                            action="/works/10828137/chapters/24029673"
                                            accept-charset="UTF-8"
                                            method="get"
                                        >
                                            <p>
                                                <select
                                                    name="selected_id"
                                                    id="selected_id"
                                                >
                                                    <option
                                                        selected="selected"
                                                        value="24029673"
                                                    >
                                                        1. Introduction
                                                    </option>
                                                    <option value="24029694">
                                                        2. Prologue - The Last
                                                        Command
                                                    </option>
                                                    <option value="24258660">
                                                        3. Unification Day
                                                    </option>
                                                    <option value="24441714">
                                                        4. Brought to Light
                                                    </option>
                                                    <option value="24652917">
                                                        5. Envisioning the
                                                        Future
                                                    </option>
                                                    <option value="24896364">
                                                        6. To Serve and Protect
                                                    </option>
                                                    <option value="25307289">
                                                        7. Battleground: Japan
                                                    </option>
                                                    <option value="25567017">
                                                        8. A Crystal Ball
                                                    </option>
                                                    <option value="25749687">
                                                        9. Research and
                                                        Engineering VII
                                                    </option>
                                                    <option value="26002041">
                                                        10. March of the
                                                        Battlemaster
                                                    </option>
                                                    <option value="26208042">
                                                        11. Tenuous Diplomacy
                                                    </option>
                                                    <option value="26450721">
                                                        12. Vitakar
                                                    </option>
                                                    <option value="26648280">
                                                        13. Trials and Templars
                                                    </option>
                                                    <option value="26827638">
                                                        14. The March
                                                        Unrelenting
                                                    </option>
                                                    <option value="27074646">
                                                        15. Demands of Necessity
                                                    </option>
                                                    <option value="27392226">
                                                        16. The Final Crusade
                                                    </option>
                                                    <option value="27651708">
                                                        17. Little Storm
                                                    </option>
                                                    <option value="27987795">
                                                        18. Annexation: Canada
                                                    </option>
                                                    <option value="28392452">
                                                        19. Preparing the Future
                                                    </option>
                                                    <option value="28744404">
                                                        20. Against the Titans
                                                    </option>
                                                    <option value="29017599">
                                                        21. The Coming Storm
                                                    </option>
                                                    <option value="29344068">
                                                        22. Subversion
                                                    </option>
                                                    <option value="29935230">
                                                        23. Research and
                                                        Engineering VIII
                                                    </option>
                                                    <option value="30474207">
                                                        24. Counterattack:
                                                        United States of America
                                                    </option>
                                                    <option value="30764040">
                                                        25. Asaru
                                                    </option>
                                                    <option value="31095351">
                                                        26. Crackdown
                                                    </option>
                                                    <option value="31463073">
                                                        27. The Guardians
                                                    </option>
                                                    <option value="31837938">
                                                        28. Operation: Sherman
                                                    </option>
                                                    <option value="32215065">
                                                        29. Siege: North America
                                                    </option>
                                                    <option value="32617413">
                                                        30. Downfall
                                                    </option>
                                                    <option value="32940831">
                                                        31. Escalation
                                                    </option>
                                                    <option value="33305274">
                                                        32. A Modest Request
                                                    </option>
                                                    <option value="33566697">
                                                        33. The Imperator
                                                    </option>
                                                    <option value="34183784">
                                                        34. Autopsy
                                                    </option>
                                                    <option value="34580039">
                                                        35. Research and
                                                        Engineering IX
                                                    </option>
                                                    <option value="34957667">
                                                        36. For God and Country
                                                    </option>
                                                    <option value="35382687">
                                                        37. Screaming
                                                    </option>
                                                    <option value="35824161">
                                                        38. Paradise
                                                    </option>
                                                    <option value="36265644">
                                                        39. Slurry
                                                    </option>
                                                    <option value="36685284">
                                                        40. Creating the Future
                                                    </option>
                                                    <option value="37082763">
                                                        41. Cracked Foundations
                                                    </option>
                                                    <option value="37483253">
                                                        42. Playing With Fire
                                                    </option>
                                                    <option value="37875233">
                                                        43. Phantom
                                                    </option>
                                                    <option value="38252774">
                                                        44. The Broken and
                                                        Defiant
                                                    </option>
                                                    <option value="38709056">
                                                        45. Miridian
                                                    </option>
                                                    <option value="39469072">
                                                        46. Harbinger
                                                    </option>
                                                    <option value="40117400">
                                                        47. The Darkening Skies
                                                    </option>
                                                    <option value="40776827">
                                                        48. Voice of the Dread
                                                        Lord
                                                    </option>
                                                    <option value="41362814">
                                                        49. March of the Dread
                                                        Lord
                                                    </option>
                                                    <option value="41983031">
                                                        50. Dream of the Dread
                                                        Lord
                                                    </option>
                                                    <option value="42839045">
                                                        51. Reign of the Dread
                                                        Lord
                                                    </option>
                                                    <option value="43459862">
                                                        52. After the Terror
                                                    </option>
                                                    <option value="44031157">
                                                        53. Enter the Harbinger
                                                    </option>
                                                    <option value="44428927">
                                                        54. Interlude - Wrath of
                                                        the Deep
                                                    </option>
                                                    <option value="44749120">
                                                        55. A Strangled Paradise
                                                    </option>
                                                    <option value="45481801">
                                                        56. Ashes of the Avatar
                                                    </option>
                                                    <option value="46886152">
                                                        57. Battleground:
                                                        Florida
                                                    </option>
                                                    <option value="47685670">
                                                        58. Siege: Tampa
                                                    </option>
                                                    <option value="48375364">
                                                        59. Enemy Lines
                                                    </option>
                                                    <option value="49205354">
                                                        60. Black Earth, Purple
                                                        Sky
                                                    </option>
                                                    <option value="50246687">
                                                        61. Conspiracies and
                                                        Coronations
                                                    </option>
                                                    <option value="51918691">
                                                        62. Research and
                                                        Engineering X
                                                    </option>
                                                    <option value="53327818">
                                                        63. Godkiller
                                                    </option>
                                                    <option value="53854636">
                                                        64. Streets of Blood,
                                                        Storms of Ice
                                                    </option>
                                                    <option value="55438492">
                                                        65. Wills of Steel,
                                                        Hearts of Stone
                                                    </option>
                                                    <option value="57028897">
                                                        66. Sever the Head
                                                    </option>
                                                    <option value="58385494">
                                                        67. The Vow and the Wish
                                                    </option>
                                                    <option value="60206926">
                                                        68. An Army of Crystal
                                                    </option>
                                                    <option value="61938601">
                                                        69. Under the Black Sun
                                                    </option>
                                                    <option value="63741322">
                                                        70. A Falling Star
                                                    </option>
                                                    <option value="66147628">
                                                        71. The Battle of the
                                                        Hiveship
                                                    </option>
                                                    <option value="68230658">
                                                        72. Revenant
                                                    </option>
                                                    <option value="70668519">
                                                        73. For Our Own
                                                    </option>
                                                    <option value="73222722">
                                                        74. Angel of Ruin
                                                    </option>
                                                    <option value="77257100">
                                                        75. Absolute
                                                    </option>
                                                    <option value="77651540">
                                                        76. Precipice
                                                    </option>
                                                    <option value="82208392">
                                                        77. Defining the Future
                                                    </option>
                                                    <option value="87088999">
                                                        78. Crescendo's Approach
                                                    </option>
                                                    <option value="113155465">
                                                        79. Bringing the Rapture
                                                    </option>
                                                    <option value="119813236">
                                                        80. Operation: Jericho
                                                    </option>
                                                    <option value="135055228">
                                                        81. Daggers to the
                                                        Hearts - Part I
                                                    </option>
                                                    <option value="135185161">
                                                        82. Daggers to the
                                                        Hearts - Part II
                                                    </option>
                                                    <option value="135299392">
                                                        83. Daggers to the
                                                        Hearts - Part III
                                                    </option>
                                                    <option value="146344447">
                                                        84. Visions of Ruin,
                                                        Armies of Zeal - Part I
                                                    </option>
                                                    <option value="146490391">
                                                        85. Visions of Ruin,
                                                        Armies of Zeal - Part II
                                                    </option>
                                                    <option value="146620384">
                                                        86. Visions of Ruin,
                                                        Armies of Zeal - Part
                                                        III
                                                    </option>
                                                    <option value="146762578">
                                                        87. Visions of Ruin,
                                                        Armies of Zeal - Part IV
                                                    </option>
                                                </select>
                                                <span class="submit actions"
                                                    ><input
                                                        type="submit"
                                                        name="commit"
                                                        value="Go"
                                                    ></span
                                                >
                                            </p>
                                        </form>
                                    </li>
                                    <li>
                                        <a href="/works/10828137/navigate"
                                            >Full-Page Index</a
                                        >
                                    </li>
                                </ul>
                            </li>

                            <li class="comments" id="show_comments_link_top">
                                <a
                                    data-remote="true"
                                    href="/comments/show_comments?chapter_id=24029673"
                                    >Comments
                                </a>
                            </li>

                            <li class="share">
                                <a
                                    class="modal modal-attached"
                                    title="Share Work"
                                    href="/works/10828137/share"
                                    aria-controls="modal"
                                    >Share</a
                                >
                            </li>

                            <li class="download">
                                <noscript>
                                    <h4 class="heading">Download</h4>
                                </noscript>
                                <button class="collapsed">Download</button>
                                <ul class="expandable secondary hidden">
                                    <li>
                                        <a
                                            href="/downloads/10828137/XCOM_The_Advent.azw3?updated_at=1731356383"
                                            >AZW3</a
                                        >
                                    </li>
                                    <li>
                                        <a
                                            href="/downloads/10828137/XCOM_The_Advent.epub?updated_at=1731356383"
                                            >EPUB</a
                                        >
                                    </li>
                                    <li>
                                        <a
                                            href="/downloads/10828137/XCOM_The_Advent.mobi?updated_at=1731356383"
                                            >MOBI</a
                                        >
                                    </li>
                                    <li>
                                        <a
                                            href="/downloads/10828137/XCOM_The_Advent.pdf?updated_at=1731356383"
                                            >PDF</a
                                        >
                                    </li>
                                    <li>
                                        <a
                                            href="/downloads/10828137/XCOM_The_Advent.html?updated_at=1731356383"
                                            >HTML</a
                                        >
                                    </li>
                                </ul>
                            </li>
                        </ul>
                        <!-- END navigation -->

                        <h3 class="landmark heading">Work Header</h3>

                        <div class="wrapper">
                            <dl class="work meta group">
                                <dt class="rating tags">Rating:</dt>

                                <dd class="rating tags">
                                    <ul class="commas">
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Mature/works"
                                                >Mature</a
                                            >
                                        </li>
                                    </ul>
                                </dd>
                                <dt class="warning tags">
                                    <a href="/tos_faq#tags">Archive Warning</a>:
                                </dt>

                                <dd class="warning tags">
                                    <ul class="commas">
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Choose%20Not%20To%20Use%20Archive%20Warnings/works"
                                            >
                                                Creator Chose Not To Use Archive Warnings
                                            </a>
                                        </li>
                                    </ul>
                                </dd>
                                <dt class="category tags">Category:</dt>

                                <dd class="category tags">
                                    <ul class="commas">
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/F*s*M/works"
                                                >F/M</a
                                            >
                                        </li>
                                    </ul>
                                </dd>
                                <dt class="fandom tags">Fandom:</dt>

                                <dd class="fandom tags">
                                    <ul class="commas">
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/XCOM:%20Enemy%20Within/works"
                                                >XCOM: Enemy Within</a
                                            >
                                        </li>
                                    </ul>
                                </dd>
                                <dt class="character tags">Characters:</dt>

                                <dd class="character tags">
                                    <ul class="commas">
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/The%20Commander%20(Male)/works"
                                                >The Commander (Male)</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Moira%20Vahlen/works"
                                                >Moira Vahlen</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Raymond%20Shen/works"
                                                >Raymond Shen</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Shaojie%20Zhang/works"
                                                >Shaojie Zhang</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/The%20Imperator/works"
                                                >The Imperator</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/OC%20-%20Character/works"
                                                >OC - Character</a
                                            >
                                        </li>
                                    </ul>
                                </dd>
                                <dt class="freeform tags">Additional Tags:</dt>

                                <dd class="freeform tags">
                                    <ul class="commas">
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/War/works"
                                                >War</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Alien%20Culture/works"
                                                >Alien Culture</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Alien%20Invasion/works"
                                                >Alien Invasion</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Alien%20Technology/works"
                                                >Alien Technology</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/XCOM%20-%20freeform/works"
                                                >XCOM - freeform</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Advent/works"
                                                >Advent</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/EXALT%20-%20Freeform/works"
                                                >EXALT - Freeform</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Espionage/works"
                                                >Espionage</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Violence/works"
                                                >Violence</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Experimentation/works"
                                                >Experimentation</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Psionics/works"
                                                >Psionics</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/totalitarianism/works"
                                                >totalitarianism</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Government/works"
                                                >Government</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Politics/works"
                                                >Politics</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Peacekeepers/works"
                                                >Peacekeepers</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Police/works"
                                                >Police</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Democracy/works"
                                                >Democracy</a
                                            >
                                        </li>
                                        <li>
                                            <a
                                                class="tag"
                                                href="/tags/Cover%20Art/works"
                                                >Cover Art</a
                                            >
                                        </li>
                                    </ul>
                                </dd>

                                <dt class="language">Language:</dt>
                                <dd class="language" lang="en">English</dd>

                                <dt class="collections">Collections:</dt>
                                <dd class="collections">
                                    <a href="/collections/myheartadores"
                                        >My Heart Adores</a
                                    >
                                </dd>

                                <dt class="stats">Stats:</dt>
                                <dd class="stats">
                                    <!-- end of cache -->

                                    <dl class="stats">
                                        <dt class="published">Published:</dt>
                                        <dd class="published">2017-05-05</dd>
                                        <dt class="status">Updated:</dt>
                                        <dd class="status">2024-07-26</dd>
                                        <dt class="words">Words:</dt>
                                        <dd class="words">2,000,503</dd>
                                        <dt class="chapters">Chapters:</dt>
                                        <dd class="chapters">87/?</dd>
                                        <dt class="comments">Comments:</dt>
                                        <dd class="comments">461</dd>
                                        <dt class="kudos">Kudos:</dt>
                                        <dd class="kudos">193</dd>
                                        <dt class="bookmarks">Bookmarks:</dt>
                                        <dd class="bookmarks">
                                            <a href="/works/10828137/bookmarks"
                                                >50</a
                                            >
                                        </dd>
                                        <dt class="hits">Hits:</dt>
                                        <dd class="hits">21,145</dd>
                                    </dl>
                                </dd>
                            </dl>
                        </div>

                        <!-- BEGIN section where work skin applies -->
                        <div id="workskin">
                            <div class="preface group">
                                <h2 class="title heading">
                                    XCOM: The Advent Directive
                                </h2>
                                <h3 class="byline heading">
                                    <a
                                        rel="author"
                                        href="/users/Xabiar/pseuds/Xabiar"
                                        >Xabiar</a
                                    >
                                </h3>

                                <div class="summary module">
                                    <h3 class="heading">Summary:</h3>
                                    <blockquote class="userstuff">
                                        <p>
                                            Test Summary Content Goes Here
                                        </p>
                                    </blockquote>
                                </div>
                            </div>

                            <div id="chapters">
                                <!-- This partial requires local variable 'chapter' -->
                                <div class="chapter" id="chapter-1">
                                    <!-- chapter management -->

                                    <div class="chapter preface group">
                                        <h3 class="title">
                                            <a
                                                href="/works/10828137/chapters/24029673"
                                                >Chapter 1</a
                                            >: Introduction
                                        </h3>

                                        <!-- only display byline if different from the main byline -->
                                    </div>

                                    <!--main content-->
                                    <div
                                        class="userstuff module"
                                        role="article"
                                    >
                                        <div>Content Goes Here</div>
                                    </div>
                                    <!--/main-->
                                </div>

                                <!-- end of cache -->
                            </div>
                        </div>
                        <!-- END work skin -->
                    </div>
                    <!-- END work -->

                    <!-- BEGIN comment section -->
                    <!-- Gets embedded anywhere we need to list comments on a top-level commentable. We need the local variable "commentable" here. -->
                    <div id="feedback" class="feedback">
                        <h3 class="landmark heading">Actions</h3>

                        <ul class="actions">
                            <li>
                                <a href="#main">↑ Top</a>
                            </li>

                            <li>
                                <a
                                    href="/works/10828137/chapters/24029694#workskin"
                                    >Next Chapter →</a
                                >
                            </li>

                            <li>
                                <form
                                    id="new_kudo"
                                    action="/kudos"
                                    accept-charset="UTF-8"
                                    method="post"
                                >
                                    <input
                                        value="10828137"
                                        autocomplete="off"
                                        type="hidden"
                                        name="kudo[commentable_id]"
                                        id="kudo_commentable_id"
                                    >
                                    <input
                                        value="Work"
                                        autocomplete="off"
                                        type="hidden"
                                        name="kudo[commentable_type]"
                                        id="kudo_commentable_type"
                                    >
                                    <input
                                        type="submit"
                                        name="commit"
                                        value="Kudos ♥"
                                        id="kudo_submit"
                                    >
                                </form>
                            </li>

                            <li id="show_comments_link">
                                <a
                                    data-remote="true"
                                    href="/comments/show_comments?chapter_id=24029673"
                                    >Comments (2)</a
                                >
                            </li>
                        </ul>

                        <div id="kudos_message"></div>

                        <h3 class="landmark heading">Kudos</h3>
                        <div id="kudos"></div>

                        <h3 class="landmark heading">
                            <a id="comments">Comments</a>
                        </h3>

                        <div
                            id="add_comment_placeholder"
                            title="top level comment"
                        ></div>

                        <!-- If we have javascript, here is where the comments will be spiffily inserted -->
                        <!-- If not, and show_comments is true, here is where the comments will be rendered -->
                        <div
                            id="comments_placeholder"
                            style="display:none;"
                        ></div>
                    </div>
                    <!-- END comments -->

                    <!-- END comment section -->
                    <div class="clear"><!--presentational--></div>
                </div>
                <!-- END main -->
            </div>
            <!-- BEGIN footer -->
            <div id="footer" role="contentinfo" class="region">
                <h3 class="landmark heading">Footer</h3>
                <ul class="navigation actions">
                    <li class="module group">
                        <h4 class="heading">About the Archive</h4>
                        <ul class="menu">
                            <li>
                                <a href="/site_map">Site Map</a>
                            </li>
                            <li>
                                <a href="/diversity">Diversity Statement</a>
                            </li>
                            <li>
                                <a href="/tos">Terms of Service</a>
                            </li>
                            <li>
                                <a href="/content">Content Policy</a>
                            </li>
                            <li>
                                <a href="/privacy">Privacy Policy</a>
                            </li>
                            <li>
                                <a href="/dmca">DMCA Policy</a>
                            </li>
                            <li>
                                <a href="https://www.otwstatus.org"
                                    >Site Status</a
                                >
                            </li>
                        </ul>
                    </li>
                    <li class="module group">
                        <h4 class="heading">Contact Us</h4>
                        <ul class="menu">
                            <li>
                                <a href="/abuse_reports/new"
                                    >Policy Questions &amp; Abuse Reports</a
                                >
                            </li>
                            <li>
                                <a href="/support"
                                    >Technical Support &amp; Feedback</a
                                >
                            </li>
                        </ul>
                    </li>
                    <li class="module group">
                        <h4 class="heading">Development</h4>
                        <ul class="menu">
                            <li>
                                <a
                                    href="https://github.com/otwcode/otwarchive/commits/v0.9.445.0"
                                    >otwarchive v0.9.445.0</a
                                >
                            </li>
                            <li>
                                <a href="/known_issues">Known Issues</a>
                            </li>
                            <li>
                                <a
                                    title="View License"
                                    href="https://www.gnu.org/licenses/old-licenses/gpl-2.0.html"
                                    >GPL-2.0-or-later</a
                                >by the <a
                                    title="Organization for Transformative Works"
                                    href="https://transformativeworks.org/"
                                    >OTW</a
                                >
                            </li>
                        </ul>
                    </li>
                </ul>
            </div>
            <!-- END footer -->
        </div>
    </body>
</html>
`;

// Sample AO3 work page with only published date (one-shot style work)
export const workPageOnlyPublishedHtml = `
<!DOCTYPE html>
<html>
<body>
<div id="workskin">
    <h2 class="title heading">A Short Story</h2>
    <h3 class="byline heading">
        <a rel="author" href="/users/TestAuthor/pseuds/TestAuthor">TestAuthor</a>
    </h3>

    <dl class="work meta group">
        <dt class="rating tags">Rating:</dt>
        <dd class="rating tags">
            <ul class="commas">
                <li><a class="tag" href="/tags/General%20Audiences/works">General Audiences</a></li>
            </ul>
        </dd>

        <dd class="language">English</dd>

        <dl class="stats">
            <dt class="published">Published:</dt>
            <dd class="published">2024-03-10</dd>

            <dt class="words">Words:</dt>
            <dd class="words">5,000</dd>

            <dt class="chapters">Chapters:</dt>
            <dd class="chapters">1/1</dd>

            <dt class="kudos">Kudos:</dt>
            <dd class="kudos">100</dd>

            <dt class="hits">Hits:</dt>
            <dd class="hits">500</dd>
        </dl>
    </dl>
</div>
<div id="chapters"></div>
</body>
</html>
`;

// Sample AO3 chapter index (navigate) page HTML fixture
export const chapterIndexHtml = `
<!DOCTYPE html>
<html>
<body>
<div id="main">
    <h2 class="heading">
        <a href="/works/10828137">XCOM: The Advent Directive</a>
        by <a rel="author" href="/users/Xabiar/pseuds/Xabiar">Xabiar</a>
    </h2>

    <ol class="chapter index group">
        <li>
            <a href="/works/10828137/chapters/24029673">1. Introduction</a>
            <span class="datetime">(2017-05-05)</span>
        </li>
        <li>
            <a href="/works/10828137/chapters/24029694">2. Prologue - The Last Command</a>
            <span class="datetime">(2017-05-05)</span>
        </li>
        <li>
            <a href="/works/10828137/chapters/24258660">3. Unification Day</a>
            <span class="datetime">(2017-05-15)</span>
        </li>
    </ol>
</div>
</body>
</html>
`;

// Minimal HTML for edge cases
export const minimalHtml = `
<!DOCTYPE html>
<html>
<body>
<div id="workskin"></div>
<div id="chapters"></div>
</body>
</html>
`;

// Empty chapter index
export const emptyChapterIndexHtml = `
<!DOCTYPE html>
<html>
<body>
<div id="main">
    <ol class="chapter index group"></ol>
</div>
</body>
</html>
`;

// Chapter index without author link
export const chapterIndexNoAuthorHtml = `
<!DOCTYPE html>
<html>
<body>
<div id="main">
    <h2 class="heading">
        <a href="/works/12345">Anonymous Work</a>
    </h2>
    <ol class="chapter index group">
        <li>
            <a href="/works/12345/chapters/11111">1. Chapter One</a>
            <span class="datetime">(2024-01-01)</span>
        </li>
    </ol>
</div>
</body>
</html>
`;
